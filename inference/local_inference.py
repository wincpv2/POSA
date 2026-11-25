"""Run the local checkpoint and persist completed minute predictions in SQLite."""

import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path
from threading import Lock
from uuid import uuid4

import torch
import wfdb

from inference.local_storage import LocalStorage
from inference.model import (
    APNEA_THRESHOLD,
    load_model,
    predict_minutes,
    preprocess_signal,
)

logger = logging.getLogger("posa.local_model")


class LocalInference:
    def __init__(self, storage: LocalStorage, checkpoint: Path, recording_source):
        self.storage = storage
        self.checkpoint = checkpoint
        self.recording_source = recording_source
        self.lock = Lock()
        self.worker = ThreadPoolExecutor(
            max_workers=1, thread_name_prefix="posa-local-model"
        )
        self.model = None
        self.device = None
        self.model_error = None
        self.storage.interrupt_predictions()
        self.storage.apply_threshold(APNEA_THRESHOLD)

    def start(self, study_id):
        if not self.checkpoint.is_file():
            raise ValueError(f"Model checkpoint missing: {self.checkpoint}")
        with self.lock:
            existing = self.storage.prediction(study_id)
            if existing and existing["run"]["status"] in {"queued", "processing"}:
                run = existing["run"]
            else:
                base, channel = self.recording_source(study_id)
                header = wfdb.rdheader(str(base))
                total = header.sig_len // 6000
                if not total:
                    raise ValueError("Analysis requires at least 60 seconds of ECG.")
                run = {
                    "id": uuid4().hex,
                    "ecg_upload_id": study_id,
                    "model_id": self.checkpoint.stem,
                    "status": "queued",
                    "progress_percent": 0,
                    "total_minutes": total,
                    "apnea_minutes": None,
                    "apnea_percent": None,
                    "error_message": None,
                    "created_at": datetime.now(UTC).isoformat(),
                    "summary_status": "not_started",
                    "summary_progress_percent": 0,
                    "summary_stage": None,
                    "summary_error_message": None,
                    "summary_updated_at": None,
                }
                self.storage.save_prediction(study_id, run, [])
                self.worker.submit(self._analyze, study_id, base, channel, run.copy())
            return {"runId": run["id"], "status": run["status"]}

    def _analyze(self, study_id, base, channel, run):
        try:
            run.update(status="processing")
            self.storage.save_prediction(study_id, run, [])
            if self.model is None:
                torch.set_num_threads(min(4, torch.get_num_threads()))
                self.model, self.device = load_model(self.checkpoint)
                self.model_error = None
            predictions = []
            total = run["total_minutes"]
            for start in range(0, total, 8):
                end = min(start + 8, total)
                samples, _ = wfdb.rdsamp(
                    str(base),
                    sampfrom=start * 6000,
                    sampto=end * 6000,
                    channels=[channel],
                )
                windows = preprocess_signal(samples)
                probabilities = predict_minutes(
                    self.model, self.device, windows, batch_size=8
                )
                predictions.extend(
                    {
                        "run_id": run["id"],
                        "minute_index": start + index,
                        "apnea_probability": float(probability),
                        "is_apnea": probability >= APNEA_THRESHOLD,
                    }
                    for index, probability in enumerate(probabilities)
                )
                run["progress_percent"] = int(end * 100 / total)
                self.storage.save_prediction(study_id, run, [])
            positive = sum(row["is_apnea"] for row in predictions)
            run.update(
                status="completed",
                progress_percent=100,
                apnea_minutes=positive,
                apnea_percent=positive * 100 / total,
                summary_status="completed",
                summary_progress_percent=100,
            )
            self.storage.save_prediction(study_id, run, predictions)
        except Exception as error:
            logger.exception("Local model analysis failed for %s", study_id)
            self.model_error = str(error)
            run.update(status="failed", error_message=str(error))
            self.storage.save_prediction(study_id, run, [])

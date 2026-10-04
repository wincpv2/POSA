from __future__ import annotations

import logging
import os
import tempfile
import threading
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

import numpy as np
import wfdb
from wfdb import processing
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from scipy.signal import butter, sosfiltfilt
from supabase import Client, create_client

from inference.model import (
    APNEA_THRESHOLD,
    SAMPLE_RATE_HZ,
    WINDOW_SAMPLES,
    load_model,
    predict_minutes,
    preprocess_signal,
)


ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")
load_dotenv(Path(__file__).with_name(".env"), override=False)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("posa.inference")

MODEL_NAME = "POSA SE-ResNet50-1D"
MODEL_VERSION = "epoch-05"
BUCKET = "ecg-files"
BATCH_SIZE = 32
FAILURE_MESSAGE = "Analysis failed. Check that the WFDB recording is valid, then retry."

model = None
device = None
model_id: str | None = None
admin: Client | None = None
worker = ThreadPoolExecutor(max_workers=1, thread_name_prefix="posa-inference")
cache_lock = threading.Lock()
signal_cache: OrderedDict[str, tuple[np.ndarray, str, str]] = OrderedDict()
filtered_record_cache: OrderedDict[str, np.ndarray] = OrderedDict()
signal_feature_cache: OrderedDict[tuple[str, int, str], tuple[np.ndarray, np.ndarray, int | None]] = OrderedDict()
annotation_cache: dict[str, tuple[tuple[str | None, str | None], np.ndarray, list[dict[str, float]], bool, bool]] = {}
CACHE_RECORDS = 2
FEATURE_CACHE_MINUTES = 24


def _settings() -> tuple[str, str, str, str]:
    model_path = os.getenv("POSA_MODEL_PATH", "").strip()
    url = (os.getenv("SUPABASE_URL") or os.getenv("EXPO_PUBLIC_SUPABASE_URL") or "").strip()
    anon_key = (os.getenv("SUPABASE_PUBLISHABLE_KEY") or os.getenv("EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY") or "").strip()
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if not model_path:
        raise RuntimeError("Set POSA_MODEL_PATH to the trained .pt checkpoint.")
    if not Path(model_path).is_file():
        raise RuntimeError(f"Model checkpoint not found at POSA_MODEL_PATH: {model_path}")
    if not url or not anon_key:
        raise RuntimeError("Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in the app .env file.")
    if not service_key:
        raise RuntimeError("Set SUPABASE_SERVICE_ROLE_KEY in the local server environment. Never add it to the Expo app.")
    return model_path, url, anon_key, service_key


def _storage_client() -> Client:
    if admin is None:
        raise HTTPException(status_code=503, detail="Inference database access is not configured.")
    return admin


def _bearer_token(authorization: str | None) -> str:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Sign in to analyze this study.")
    return authorization[7:].strip()


def _authorized_study(upload_id: str, token: str) -> dict[str, Any]:
    client = _storage_client()
    try:
        user_response = client.auth.get_user(token)
        user = user_response.user
    except Exception as exc:
        logger.info("Supabase token validation failed: %s", type(exc).__name__)
        raise HTTPException(status_code=401, detail="Your session expired. Sign in again.") from exc
    if user is None:
        raise HTTPException(status_code=401, detail="Your session expired. Sign in again.")

    result = client.table("ecg_uploads").select(
        "id, patient_id, clinician_id, record_code, storage_path, original_filename, sampling_rate_hz, duration_seconds, deleted_at"
    ).eq("id", upload_id).maybe_single().execute()
    study = result.data
    if not study or study.get("deleted_at"):
        raise HTTPException(status_code=404, detail="Study not found.")
    if study["clinician_id"] != user.id:
        linked = client.table("clinician_patients").select("patient_id").eq(
            "clinician_id", user.id
        ).eq("patient_id", study["patient_id"]).is_("deleted_at", "null").limit(1).execute()
        if not linked.data:
            raise HTTPException(status_code=403, detail="You do not have access to this study.")
    return study


def _record_signal(study: dict[str, Any]) -> tuple[np.ndarray, str, str]:
    upload_id = study["id"]
    with cache_lock:
        cached = signal_cache.get(upload_id)
        if cached is not None:
            signal_cache.move_to_end(upload_id)
            return cached

    client = _storage_client()
    storage_path = study["storage_path"]
    folder, header_name = storage_path.rsplit("/", 1)
    header_stem = Path(header_name).stem.lower()
    try:
        listing = client.storage.from_(BUCKET).list(folder)
        names = {item.get("name", "") for item in listing}
        hea = next((name for name in names if name.lower() == f"{header_stem}.hea"), None)
        dat = next((name for name in names if name.lower() == f"{header_stem}.dat"), None)
        if not hea or not dat:
            raise ValueError("The uploaded WFDB header and signal file must be paired.")
        header_bytes = client.storage.from_(BUCKET).download(f"{folder}/{hea}")
        signal_bytes = client.storage.from_(BUCKET).download(f"{folder}/{dat}")
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Unable to load WFDB files for upload %s", upload_id)
        raise HTTPException(status_code=422, detail="Could not read the stored WFDB recording.") from exc

    with tempfile.TemporaryDirectory(prefix="posa-wfdb-") as temp:
        base = Path(temp) / Path(hea).stem
        base.with_suffix(".hea").write_bytes(header_bytes)
        base.with_suffix(".dat").write_bytes(signal_bytes)
        try:
            record = wfdb.rdrecord(str(base), physical=True)
        except Exception as exc:
            raise HTTPException(status_code=422, detail="The WFDB recording could not be decoded.") from exc
        if not np.isclose(record.fs, SAMPLE_RATE_HZ):
            raise HTTPException(status_code=422, detail="This model accepts ECG recordings sampled at exactly 100 Hz.")
        if record.p_signal is None or record.p_signal.ndim != 2 or record.p_signal.shape[1] < 1:
            raise HTTPException(status_code=422, detail="The WFDB recording does not contain an ECG channel.")
        signal = np.asarray(record.p_signal[:, 0], dtype=np.float32)
        lead = record.sig_name[0] if record.sig_name else "Channel 1"
        units = getattr(record, "units", None) or getattr(record, "sig_units", None) or []
        unit = str(units[0] or "") if units else ""

    with cache_lock:
        signal_cache[upload_id] = (signal, lead, unit)
        signal_cache.move_to_end(upload_id)
        while len(signal_cache) > CACHE_RECORDS:
            signal_cache.popitem(last=False)
    return signal, lead, unit


def _refine_r_peaks(filtered: np.ndarray, samples: np.ndarray) -> np.ndarray:
    """Refine QRS fiducials to the dominant local R apex, matching Aom's viewer."""
    samples = np.asarray(samples, dtype=np.int64)
    samples = samples[(samples >= 0) & (samples < len(filtered))]
    if not len(samples):
        return samples
    before, after = round(0.04 * SAMPLE_RATE_HZ), round(0.10 * SAMPLE_RATE_HZ)
    positive, negative = [], []
    for sample in samples[::max(1, len(samples) // 2000)]:
        window = filtered[max(0, sample - before):min(len(filtered), sample + after + 1)]
        if len(window):
            baseline = float(np.median(window))
            positive.append(float(np.max(window) - baseline))
            negative.append(float(baseline - np.min(window)))
    polarity = 1 if np.median(positive) >= np.median(negative) else -1
    refined = []
    for sample in samples:
        start, end = max(0, sample - before), min(len(filtered), sample + after + 1)
        refined.append(start + int(np.argmax(polarity * filtered[start:end])))
    return np.unique(refined)


def _apnea_intervals(samples: np.ndarray, symbols: list[str], duration: float) -> list[dict[str, float]]:
    intervals: list[dict[str, float]] = []
    tolerance = max(0.5, 1.0 / SAMPLE_RATE_HZ)
    for sample, symbol in zip(samples, symbols):
        if symbol != "A":
            continue
        start = float(sample) / SAMPLE_RATE_HZ
        end = min(duration, start + 60.0)
        if end <= start:
            continue
        if intervals and start <= intervals[-1]["endSeconds"] + tolerance:
            intervals[-1]["endSeconds"] = max(intervals[-1]["endSeconds"], end)
        else:
            intervals.append({"startSeconds": start, "endSeconds": end})
    return intervals


def _record_annotations(
    study: dict[str, Any], duration: float, filtered_record: np.ndarray
) -> tuple[np.ndarray | None, list[dict[str, float]], bool]:
    """Load optional WFDB sidecars and group apnea labels into Aom-style intervals."""
    folder, header_name = study["storage_path"].rsplit("/", 1)
    stem = Path(header_name).stem.lower()
    listing = _storage_client().storage.from_(BUCKET).list(folder)
    matches = {item.get("name", "").lower(): item for item in listing}
    qrs_item = matches.get(f"{stem}.qrs")
    apn_item = matches.get(f"{stem}.apn")
    qrs_name = qrs_item.get("name") if qrs_item else None
    apn_name = apn_item.get("name") if apn_item else None
    version = (
        f"{qrs_name}:{qrs_item.get('updated_at')}" if qrs_item else None,
        f"{apn_name}:{apn_item.get('updated_at')}" if apn_item else None,
    )
    with cache_lock:
        cached = annotation_cache.get(study["id"])
        if cached and cached[0] == version:
            return cached[1] if cached[3] else None, cached[2], cached[4]
        if cached:
            for key in [key for key in signal_feature_cache if key[0] == study["id"]]:
                del signal_feature_cache[key]

    qrs_samples = np.empty(0, dtype=np.int64)
    apnea_intervals: list[dict[str, float]] = []
    qrs_available = apnea_available = False
    if qrs_name or apn_name:
        with tempfile.TemporaryDirectory(prefix="posa-wfdb-ann-") as temp:
            base = Path(temp) / Path(header_name).stem
            for extension, name in (("qrs", qrs_name), ("apn", apn_name)):
                if not name:
                    continue
                try:
                    (Path(temp) / f"{Path(header_name).stem}.{extension}").write_bytes(
                        _storage_client().storage.from_(BUCKET).download(f"{folder}/{name}")
                    )
                    ann = wfdb.rdann(str(base), extension)
                    if extension == "qrs":
                        qrs_samples = np.asarray(
                            [sample for sample, symbol in zip(ann.sample, ann.symbol) if symbol == "N"],
                            dtype=np.int64,
                        )
                        qrs_available = len(qrs_samples) > 0
                    else:
                        apnea_available = True
                        apnea_intervals = _apnea_intervals(ann.sample, ann.symbol, duration)
                except Exception as exc:
                    logger.warning("Ignoring invalid %s annotation for %s (%s)", extension, study["id"], type(exc).__name__)
    if qrs_available:
        qrs_samples = _refine_r_peaks(filtered_record, qrs_samples)
    with cache_lock:
        annotation_cache[study["id"]] = (version, qrs_samples, apnea_intervals, qrs_available, apnea_available)
    return qrs_samples if qrs_available else None, apnea_intervals, apnea_available


def _signal_features(
    upload_id: str,
    minute: int,
    segment: np.ndarray,
    annotated_peaks: np.ndarray | None = None,
    filtered_segment: np.ndarray | None = None,
) -> tuple[np.ndarray, np.ndarray, int | None, str]:
    source = "qrs_annotation" if annotated_peaks is not None else "xqrs"
    key = (upload_id, minute, source)
    with cache_lock:
        cached = signal_feature_cache.get(key)
        if cached is not None:
            signal_feature_cache.move_to_end(key)
            return (*cached, source)

    if filtered_segment is None:
        finite = np.nan_to_num(segment, nan=0.0, posinf=0.0, neginf=0.0).astype(np.float64, copy=False)
        sos = butter(4, (0.5, 45.0), btype="bandpass", fs=SAMPLE_RATE_HZ, output="sos")
        filtered = sosfiltfilt(sos, finite).astype(np.float32)
    else:
        filtered = filtered_segment.astype(np.float32, copy=False)
    if annotated_peaks is None:
        try:
            peaks = np.asarray(processing.xqrs_detect(filtered, fs=SAMPLE_RATE_HZ, verbose=False), dtype=np.int64)
        except Exception as exc:
            logger.info("QRS detection unavailable for %s minute %s (%s)", upload_id, minute, type(exc).__name__)
            peaks = np.empty(0, dtype=np.int64)
        peaks = _refine_r_peaks(filtered, peaks)
    else:
        peaks = annotated_peaks
    rr = np.diff(peaks) / SAMPLE_RATE_HZ
    valid_rr = rr[(rr >= 0.3) & (rr <= 2.0)]
    bpm = round(60.0 / float(np.median(valid_rr))) if len(valid_rr) >= 2 else None
    result = (filtered, peaks, bpm)
    with cache_lock:
        signal_feature_cache[key] = result
        signal_feature_cache.move_to_end(key)
        while len(signal_feature_cache) > FEATURE_CACHE_MINUTES:
            signal_feature_cache.popitem(last=False)
    return (*result, source)


def _filtered_record(upload_id: str, signal: np.ndarray) -> np.ndarray:
    with cache_lock:
        cached = filtered_record_cache.get(upload_id)
        if cached is not None:
            filtered_record_cache.move_to_end(upload_id)
            return cached
    finite = np.nan_to_num(signal, nan=0.0, posinf=0.0, neginf=0.0).astype(np.float64, copy=False)
    sos = butter(4, (0.5, 45.0), btype="bandpass", fs=SAMPLE_RATE_HZ, output="sos")
    filtered = sosfiltfilt(sos, finite)
    with cache_lock:
        filtered_record_cache[upload_id] = filtered
        while len(filtered_record_cache) > CACHE_RECORDS:
            filtered_record_cache.popitem(last=False)
    return filtered


def _set_upload_status(upload_id: str, status: str, duration_seconds: int | None = None) -> None:
    update: dict[str, Any] = {"status": status}
    if duration_seconds is not None:
        update["duration_seconds"] = duration_seconds
    _storage_client().table("ecg_uploads").update(update).eq("id", upload_id).execute()


def _process_run(run_id: str, study: dict[str, Any]) -> None:
    upload_id = study["id"]
    client = _storage_client()
    try:
        assert model is not None and device is not None
        signal, _, _ = _record_signal(study)
        windows = preprocess_signal(signal)
        total = len(windows)
        duration_seconds = total * 60
        client.table("prediction_runs").update({
            "status": "processing",
            "progress_percent": 0,
            "total_minutes": total,
            "started_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", run_id).execute()
        _set_upload_status(upload_id, "processing", duration_seconds)

        minute_rows: list[dict[str, Any]] = []
        with torch_inference_context():
            for start in range(0, total, BATCH_SIZE):
                probabilities = predict_minutes(model, device, windows[start : start + BATCH_SIZE], BATCH_SIZE)
                for offset, probability in enumerate(probabilities):
                    minute_index = start + offset
                    minute_rows.append({
                        "run_id": run_id,
                        "minute_index": minute_index,
                        "apnea_probability": float(probability),
                        "is_apnea": probability >= APNEA_THRESHOLD,
                    })
                percent = min(95, int((start + len(probabilities)) * 95 / total))
                client.table("prediction_runs").update({"progress_percent": percent}).eq("id", run_id).execute()

        apnea_minutes = sum(row["is_apnea"] for row in minute_rows)
        apnea_percent = apnea_minutes * 100.0 / total
        for start in range(0, len(minute_rows), 500):
            client.table("prediction_minutes").insert(minute_rows[start : start + 500]).execute()
        client.table("prediction_runs").update({
            "status": "completed",
            "progress_percent": 100,
            "total_minutes": total,
            "apnea_minutes": apnea_minutes,
            "apnea_percent": apnea_percent,
            "error_message": None,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", run_id).execute()
        _set_upload_status(upload_id, "completed", duration_seconds)
    except Exception as exc:
        logger.exception("Inference failed for run %s (%s)", run_id, type(exc).__name__)
        try:
            client.table("prediction_runs").update({
                "status": "failed",
                "error_message": FAILURE_MESSAGE,
                "completed_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", run_id).execute()
            _set_upload_status(upload_id, "failed")
        except Exception:
            logger.exception("Could not persist failure state for run %s", run_id)


class torch_inference_context:
    """Small context wrapper to keep torch import isolated to model startup."""

    def __enter__(self):
        import torch
        self.context = torch.inference_mode()
        self.context.__enter__()
        return self

    def __exit__(self, exc_type, exc, traceback):
        return self.context.__exit__(exc_type, exc, traceback)


@asynccontextmanager
async def lifespan(_: FastAPI):
    global model, device, admin, model_id
    model_path, supabase_url, _, service_key = _settings()
    model, device = load_model(model_path)
    admin = create_client(supabase_url, service_key)
    registered = admin.table("models").upsert({
        "name": MODEL_NAME,
        "version": MODEL_VERSION,
        "model_type": "cnn",
        "artifact_path": "POSA_MODEL_PATH",
        "metrics": None,
        "is_active": True,
    }, on_conflict="name,version").execute()
    model_id = registered.data[0]["id"]
    logger.info("Loaded %s %s on %s", MODEL_NAME, MODEL_VERSION, device)
    yield
    worker.shutdown(wait=False, cancel_futures=True)


app = FastAPI(title="POSA ECG Inference", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


@app.get("/health")
def health() -> dict[str, str | bool]:
    return {"ok": model is not None and admin is not None, "model": MODEL_NAME, "version": MODEL_VERSION}


@app.post("/v1/studies/{upload_id}/analysis", status_code=202)
def start_analysis(upload_id: str, authorization: str | None = Header(default=None)) -> dict[str, str]:
    global model_id
    token = _bearer_token(authorization)
    study = _authorized_study(upload_id, token)
    client = _storage_client()
    latest_response = client.table("prediction_runs").select("id,status").eq(
        "ecg_upload_id", upload_id
    ).order("created_at", desc=True).limit(1).execute()
    latest = latest_response.data[0] if latest_response.data else None
    if latest and latest["status"] in {"queued", "processing", "completed"}:
        return {"runId": latest["id"], "status": latest["status"]}
    if model_id is None:
        raise HTTPException(status_code=503, detail="The model is not loaded.")
    inserted = client.table("prediction_runs").insert({
        "ecg_upload_id": upload_id,
        "model_id": model_id,
        "status": "queued",
        "progress_percent": 0,
    }).execute()
    run_id = inserted.data[0]["id"]
    _set_upload_status(upload_id, "processing")
    worker.submit(_process_run, run_id, study)
    return {"runId": run_id, "status": "queued"}


@app.get("/v1/studies/{upload_id}/signal")
def get_signal_minute(
    upload_id: str,
    minute: int = Query(ge=0),
    mode: Literal["raw", "filtered"] = "raw",
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    token = _bearer_token(authorization)
    study = _authorized_study(upload_id, token)
    signal, lead, unit = _record_signal(study)
    start = minute * WINDOW_SAMPLES
    end = min(start + WINDOW_SAMPLES, len(signal))
    if start >= len(signal):
        raise HTTPException(status_code=404, detail="Minute is outside the recording.")
    raw_segment = signal[start:end]
    filtered_record = _filtered_record(upload_id, signal)
    duration = len(signal) / SAMPLE_RATE_HZ
    annotated_peaks, apnea_intervals, apnea_available = _record_annotations(study, duration, filtered_record)
    minute_peaks = None if annotated_peaks is None else annotated_peaks[
        (annotated_peaks >= start) & (annotated_peaks < end)
    ] - start
    filtered, peaks, bpm, peak_source = _signal_features(
        upload_id, minute, raw_segment, minute_peaks, filtered_record[start:end]
    )
    samples = raw_segment if mode == "raw" else filtered
    return {
        "uploadId": upload_id,
        "minuteIndex": minute,
        "samplingRateHz": SAMPLE_RATE_HZ,
        "lead": lead,
        "unit": unit,
        "mode": mode,
        "rPeakSource": peak_source,
        "samples": np.nan_to_num(samples, nan=0.0, posinf=0.0, neginf=0.0).tolist(),
        "rPeakSamples": peaks.tolist(),
        "estimatedBpm": bpm,
        "apneaAnnotationsAvailable": apnea_available,
        "apneaIntervals": apnea_intervals,
    }

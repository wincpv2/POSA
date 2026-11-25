"""Serve the POSA web export and a local Apnea-ECG archive on loopback."""

from __future__ import annotations

import argparse
import json
import math
import re
import shutil
from dataclasses import dataclass
from functools import lru_cache
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from io import StringIO
from pathlib import Path, PurePosixPath
from tempfile import TemporaryDirectory
from threading import Lock
from urllib.parse import parse_qs, urlsplit
from zipfile import ZipFile

import numpy as np
import wfdb
from matplotlib.backends.backend_svg import FigureCanvasSVG
from matplotlib.figure import Figure
from scipy.signal import butter, sosfiltfilt

from inference.gcg_bridge import GcgBridge
from inference.local_inference import LocalInference
from inference.local_storage import LocalStorage
from inference.xqrs_worker import detect_xqrs_chunk

RECORD_ID = r"[a-z][0-9]{2}"
ARCHIVE_MEMBER = re.compile(rf"{RECORD_ID}r?\.(?:hea|dat|apn|qrs)")
SUPPORTED_RATE = 100


@dataclass(frozen=True)
class Channel:
    source: str
    index: int
    name: str
    unit: str
    sample_count: int


@dataclass(frozen=True)
class Recording:
    channels: list[Channel]
    labels: dict[int, str]


class ApneaArchive:
    """Index each ECG once and attach the companion respiratory channels."""

    def __init__(self, archive_path: Path, cache_path: Path) -> None:
        self.archive_path = archive_path
        self.cache_path = cache_path
        self.extract_lock = Lock()
        self.members: dict[str, str] = {}
        with ZipFile(archive_path) as archive:
            for entry in archive.infolist():
                name = PurePosixPath(entry.filename).name
                if entry.is_dir() or not ARCHIVE_MEMBER.fullmatch(name):
                    continue
                if name in self.members:
                    raise ValueError(
                        f"The archive contains more than one copy of {name}."
                    )
                self.members[name] = entry.filename

        self.records: dict[str, Recording] = {}
        for name in sorted(self.members):
            record_id = Path(name).stem
            if name != f"{record_id}.hea" or not re.fullmatch(RECORD_ID, record_id):
                continue
            if f"{record_id}.dat" not in self.members:
                continue
            channels = self._channels(record_id)
            if len(channels) != 1 or channels[0].name != "ECG":
                raise ValueError(f"{record_id}: expected a single ECG channel.")
            total_minutes = math.ceil(channels[0].sample_count / (60 * SUPPORTED_RATE))
            if (
                f"{record_id}r.hea" in self.members
                and f"{record_id}r.dat" in self.members
            ):
                channels.extend(self._channels(f"{record_id}r"))
            labels = self._minute_labels(record_id, total_minutes)
            self.records[record_id] = Recording(channels, labels)
        if not self.records:
            raise ValueError(
                "The archive contains no matching ECG header and signal pairs."
            )

    def _extract(self, name: str) -> Path:
        destination = self.cache_path / name
        with self.extract_lock:
            if destination.is_file():
                return destination
            temporary_path = destination.with_suffix(destination.suffix + ".part")
            with (
                ZipFile(self.archive_path) as archive,
                archive.open(self.members[name]) as source,
                temporary_path.open("wb") as target,
            ):
                shutil.copyfileobj(source, target)
            temporary_path.replace(destination)
        return destination

    def _channels(self, record_id: str) -> list[Channel]:
        base = self._extract(f"{record_id}.hea").with_suffix("")
        header = wfdb.rdheader(str(base))
        if (
            not isinstance(header, wfdb.Record)
            or header.fs != SUPPORTED_RATE
            or header.sig_len <= 0
            or set(header.file_name) != {f"{record_id}.dat"}
            or set(header.fmt) != {"16"}
        ):
            raise ValueError(
                f"{record_id}: expected a local 100 Hz WFDB format 16 recording."
            )

        return [
            Channel(
                record_id, index, name, "%" if name == "SpO2" else unit, header.sig_len
            )
            for index, (name, unit) in enumerate(
                zip(header.sig_name, header.units, strict=True)
            )
        ]

    def _minute_labels(self, record_id: str, total_minutes: int) -> dict[int, str]:
        name = f"{record_id}.apn"
        if name not in self.members:
            return {}
        annotations = wfdb.rdann(str(self._extract(name).with_suffix("")), "apn")
        labels: dict[int, str] = {}
        for sample, symbol in zip(annotations.sample, annotations.symbol, strict=True):
            minute = int(sample) // (60 * SUPPORTED_RATE)
            if 0 <= minute < total_minutes and symbol in {"A", "N"}:
                labels[minute] = "apnea" if symbol == "A" else "normal"
        return labels

    def catalog(self) -> list[dict]:
        return [
            {
                "id": record_id,
                "labelledMinutes": len(record.labels),
                "apneaMinutes": sum(
                    label == "apnea" for label in record.labels.values()
                ),
                "samplingRateHz": SUPPORTED_RATE,
                "channels": [
                    {
                        "name": channel.name,
                        "durationSeconds": channel.sample_count / SUPPORTED_RATE,
                    }
                    for channel in record.channels
                ],
            }
            for record_id, record in self.records.items()
        ]

    def intervals(self, record_id: str) -> list[dict]:
        intervals = []
        duration = self.records[record_id].channels[0].sample_count / SUPPORTED_RATE
        for minute, label in sorted(self.records[record_id].labels.items()):
            if label != "apnea":
                continue
            start, end = minute * 60, min((minute + 1) * 60, duration)
            if intervals and intervals[-1]["endSeconds"] == start:
                intervals[-1]["endSeconds"] = end
            else:
                intervals.append({"startSeconds": start, "endSeconds": end})
        return intervals

    def timeline(self, record_id: str) -> dict:
        duration = self.records[record_id].channels[0].sample_count / SUPPORTED_RATE
        bars = "".join(
            f'<rect x="{interval["startSeconds"] / duration * 1000:.2f}" y="12" width="{(interval["endSeconds"] - interval["startSeconds"]) / duration * 1000:.2f}" height="56" fill="#FF6B57"/>'
            for interval in self.intervals(record_id)
        )
        svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 80"><rect width="1000" height="80" fill="#12283A"/>{bars}</svg>'
        return {
            "uploadId": record_id,
            "runId": record_id,
            "durationSeconds": duration,
            "source": "archive_annotations",
            "svg": svg,
        }

    def summary(self, record_id: str, base: Path | None = None) -> dict:
        record = self.records[record_id]
        channel = record.channels[0]
        duration = channel.sample_count / SUPPORTED_RATE
        if base is None:
            base = self._extract(f"{record_id}.qrs").with_suffix("")
        qrs_samples = (
            wfdb.rdann(str(base), "qrs").sample
            if base.with_suffix(".qrs").is_file()
            else np.array([], dtype=int)
        )
        rr = np.diff(qrs_samples) / SUPPORTED_RATE
        valid = rr[(rr >= 0.3) & (rr <= 2.0)]
        pairs = (rr[:-1] >= 0.3) & (rr[:-1] <= 2) & (rr[1:] >= 0.3) & (rr[1:] <= 2)
        differences = np.diff(rr)[pairs]
        charts = {"fullNightOverviewSvg": self.timeline(record_id)["svg"]}

        def chart(title, x, y):
            figure = Figure(figsize=(10, 2.6), facecolor="#12283A")
            axis = figure.subplots()
            axis.set_facecolor("#12283A")
            axis.plot(x, y, color="#90E0EF", linewidth=0.8)
            axis.set_title(title, color="#CAF0F8")
            axis.tick_params(colors="#CAF0F8")
            figure.tight_layout()
            output = StringIO()
            FigureCanvasSVG(figure).print_svg(output)
            return output.getvalue()

        beat_times = qrs_samples[1:] / 100 / 3600
        mask = (rr >= 0.3) & (rr <= 2)
        charts["heartRateSvg"] = chart(
            "Archived QRS heart rate (bpm) / hours",
            beat_times[mask][::20],
            (60 / valid)[::20],
        )
        hours = range(math.ceil(duration / 3600))
        burden = []
        for hour in hours:
            labels = [
                label for minute, label in record.labels.items() if minute // 60 == hour
            ]
            burden.append(
                100 * labels.count("apnea") / len(labels) if labels else np.nan
            )
        charts["hourlyApneaSvg"] = chart(
            "Reference apnea-labeled minutes (%) / hour", list(hours), burden
        )
        counts, edges = np.histogram(valid, bins=30)
        charts["rrHistogramSvg"] = chart(
            "Archived QRS RR distribution / seconds", edges[:-1], counts
        )
        return {
            "uploadId": record_id,
            "durationSeconds": duration,
            "samplingRateHz": 100,
            "lead": "ECG",
            "unit": "mV",
            "rPeakSource": "qrs_annotation",
            "qrsAnnotationsAvailable": bool(qrs_samples.size),
            "apneaAnnotationsAvailable": bool(record.labels),
            "labelledMinutes": len(record.labels),
            "apneaLabelMinutes": sum(
                label == "apnea" for label in record.labels.values()
            ),
            "apneaIntervals": self.intervals(record_id),
            "medianHrBpm": float(60 / np.median(valid)) if valid.size else None,
            "sdnnMs": float(np.std(valid, ddof=1) * 1000) if valid.size > 1 else None,
            "rmssdMs": float(np.sqrt(np.mean(differences**2)) * 1000)
            if differences.size
            else None,
            "hrvSource": "normal_beat_qrs",
            "validRrPercent": float(valid.size * 100 / rr.size) if rr.size else None,
            "heartRateByMinute": [],
            "rrHistogram": {"edgesSeconds": [], "counts": []},
            "charts": {"screen": charts, "print": charts},
            "modelMetrics": {
                "runId": record_id,
                "analysedMinutes": 0,
                "probabilityWeightedApneaMinutes": None,
                "probabilityWeightedApneaSharePercent": None,
                "thresholdApneaMinutes": None,
                "thresholdApneaSharePercent": None,
                "predictedRuns": None,
                "threshold": 0.5,
            },
        }

    def minute(self, record_id: str, channel_index: int, minute: int) -> dict:
        record = self.records[record_id]
        if not 0 <= channel_index < len(record.channels):
            raise ValueError("Channel is outside this recording.")
        channel = record.channels[channel_index]
        start = minute * 60 * SUPPORTED_RATE
        if not 0 <= start < channel.sample_count:
            raise ValueError("Minute is outside this recording.")
        end = min(start + 60 * SUPPORTED_RATE, channel.sample_count)
        self._extract(f"{channel.source}.dat")
        base = str(self.cache_path / channel.source)
        samples, _ = wfdb.rdsamp(
            base, sampfrom=start, sampto=end, channels=[channel.index]
        )

        peaks = []
        qrs_name = f"{record_id}.qrs"
        if channel_index == 0 and qrs_name in self.members:
            self._extract(qrs_name)
            annotations = wfdb.rdann(base, "qrs", sampfrom=start, sampto=end - 1)
            peaks = [int(sample) - start for sample in annotations.sample]

        return {
            "uploadId": record_id,
            "minuteIndex": minute,
            "samplingRateHz": SUPPORTED_RATE,
            "unit": channel.unit,
            "samples": [
                round(float(value), 4) if math.isfinite(value) else None
                for value in samples[:, 0]
            ],
            "rPeakSamples": peaks,
            "label": record.labels.get(minute),
        }


def serve(archive: ApneaArchive, web_dir: Path, port: int, data_dir: Path) -> None:
    catalog = archive.catalog()
    storage = LocalStorage(data_dir)
    gcg = GcgBridge()

    def load_local_studies():
        rows = storage.studies()
        for row in rows:
            source = f"{row['id']}/{row['stem']}"
            header = wfdb.rdheader(str(storage.root / source))
            channel_index = header.sig_name.index("ECG")
            archive.records[row["id"]] = Recording(
                [
                    Channel(
                        source,
                        channel_index,
                        "ECG",
                        header.units[channel_index],
                        header.sig_len,
                    )
                ],
                {},
            )
        return rows

    load_local_studies()
    chart_lock = Lock()

    def recording_source(study_id):
        record = archive.records.get(study_id)
        if record is None:
            raise ValueError("Study not found.")
        channel = record.channels[0]
        if len(study_id) == 32:
            return storage.root / channel.source, channel.index
        archive._extract(f"{channel.source}.dat")
        return archive.cache_path / channel.source, channel.index

    model_path = (
        Path(__file__).resolve().parents[1] / "model" / "se_resnet50_epoch_05.pt"
    )
    inference = LocalInference(storage, model_path, recording_source)

    @lru_cache(maxsize=24)
    def local_signal_features(study_id, minute):
        base, channel = recording_source(study_id)
        sample_count = archive.records[study_id].channels[0].sample_count
        start = minute * 6000
        if start < 0 or start >= sample_count:
            raise ValueError("Minute is outside this recording.")
        samples, _ = wfdb.rdsamp(
            str(base),
            sampfrom=start,
            sampto=min(start + 6000, sample_count),
            channels=[channel],
        )
        raw = samples[:, 0]
        finite = np.nan_to_num(raw, nan=0.0, posinf=0.0, neginf=0.0)
        filtered = (
            sosfiltfilt(
                butter(4, [0.5, 40], btype="bandpass", fs=100, output="sos"), finite
            )
            if len(finite) > 30
            else finite
        )
        peaks = (
            detect_xqrs_chunk(filtered, 100)
            if len(filtered) >= 100
            else np.array([], dtype=int)
        )
        rr = np.diff(peaks) / 100
        valid_rr = rr[(rr >= 0.3) & (rr <= 2.0)]
        bpm = round(60 / float(np.median(valid_rr))) if valid_rr.size >= 2 else None
        return raw, filtered, peaks.tolist(), bpm

    def probability_timeline(study_id, prediction):
        duration = archive.records[study_id].channels[0].sample_count / 100
        points = " ".join(
            f"{30 + row['minute_index'] * 940 / max(1, len(prediction['minutes']) - 1):.2f},{115 - row['apnea_probability'] * 100:.2f}"
            for row in prediction["minutes"]
        )
        svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 140"><rect width="1000" height="140" fill="#12283A"/><text x="2" y="15" fill="#CAF0F8" font-size="11">100%</text><text x="8" y="118" fill="#CAF0F8" font-size="11">0%</text><line x1="30" x2="970" y1="65" y2="65" stroke="#FF6B57" stroke-dasharray="5 4"/><text x="920" y="60" fill="#FF6B57" font-size="11">50%</text><polyline points="{points}" fill="none" stroke="#90E0EF" stroke-width="2"/></svg>'
        return {
            "uploadId": study_id,
            "runId": prediction["run"]["id"],
            "durationSeconds": duration,
            "source": "model_prediction",
            "svg": svg,
        }

    def prediction_timeline(study_id, prediction):
        duration = archive.records[study_id].channels[0].sample_count / 100
        intervals = []
        for minute in sorted(
            prediction["minutes"], key=lambda row: row["minute_index"]
        ):
            if not minute["is_apnea"]:
                continue
            start = minute["minute_index"] * 60
            end = min(start + 60, duration)
            if intervals and intervals[-1][1] == start:
                intervals[-1][1] = end
            else:
                intervals.append([start, end])
        bars = "".join(
            f'<rect x="{start / duration * 1000:.2f}" y="12" width="{(end - start) / duration * 1000:.2f}" height="56" fill="#FF6B57"/>'
            for start, end in intervals
        )
        return {
            "uploadId": study_id,
            "runId": prediction["run"]["id"],
            "durationSeconds": duration,
            "source": "model_prediction",
            "svg": f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 80"><rect width="1000" height="80" fill="#12283A"/>{bars}</svg>',
        }

    def model_summary(study_id, prediction):
        base, _ = recording_source(study_id)
        if len(study_id) != 32:
            archive._extract(f"{study_id}.qrs")
        with chart_lock:
            summary = archive.summary(study_id, base)
        minutes = prediction["minutes"]
        run = prediction["run"]
        total = len(minutes)
        weighted = sum(row["apnea_probability"] for row in minutes)
        positive = sum(row["is_apnea"] for row in minutes)
        predicted_runs = sum(
            row["is_apnea"] and (index == 0 or not minutes[index - 1]["is_apnea"])
            for index, row in enumerate(minutes)
        )
        summary["modelMetrics"] = {
            "runId": run["id"],
            "analysedMinutes": total,
            "probabilityWeightedApneaMinutes": weighted,
            "probabilityWeightedApneaSharePercent": weighted * 100 / total,
            "thresholdApneaMinutes": positive,
            "thresholdApneaSharePercent": positive * 100 / total,
            "predictedRuns": predicted_runs,
            "threshold": 0.5,
        }
        for charts in summary["charts"].values():
            charts["modelPredictionSvg"] = probability_timeline(study_id, prediction)[
                "svg"
            ]
            bars = []
            for hour in range(math.ceil(total / 60)):
                hour_minutes = minutes[hour * 60 : (hour + 1) * 60]
                share = sum(row["is_apnea"] for row in hour_minutes) / len(hour_minutes)
                x = 30 + hour * 55
                bars.append(
                    f'<rect x="{x}" y="{120 - share * 100:.2f}" width="35" height="{share * 100:.2f}" fill="#90E0EF"/><text x="{x}" y="140" fill="#CAF0F8" font-size="11">{hour + 1}</text>'
                )
            width = max(180, 60 + math.ceil(total / 60) * 55)
            charts["hourlyApneaSvg"] = (
                f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} 150"><text x="5" y="12" fill="#CAF0F8" font-size="11">Predicted apnea share per hour (0-100%)</text>{"".join(bars)}</svg>'
            )
        return summary

    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs) -> None:
            super().__init__(*args, directory=str(web_dir), **kwargs)

        def list_directory(self, path):
            self.send_error(404)

        def do_POST(self) -> None:
            if self.headers.get("Host", "").lower() not in {
                f"127.0.0.1:{port}",
                f"localhost:{port}",
            }:
                self.send_error(403)
                return
            origin = self.headers.get("Origin")
            if origin and origin not in {
                f"http://127.0.0.1:{port}",
                f"http://localhost:{port}",
            }:
                self.send_error(403)
                return
            try:
                analysis_match = re.fullmatch(
                    rf"/api/dataset/service/v1/studies/({RECORD_ID}|[a-f0-9]{{32}})/analysis",
                    self.path,
                )
                if analysis_match:
                    self.send_json(200, inference.start(analysis_match[1]))
                    return
                summary_match = re.fullmatch(
                    rf"/api/dataset/service/v1/studies/({RECORD_ID}|[a-f0-9]{{32}})/summary(?:\?refresh=true)?",
                    self.path,
                )
                if summary_match:
                    prediction = storage.prediction(summary_match[1])
                    if not prediction:
                        raise ValueError("Run model analysis first.")
                    self.send_json(
                        200,
                        {
                            "runId": prediction["run"]["id"],
                            "status": prediction["run"]["summary_status"],
                            "progressPercent": prediction["run"][
                                "summary_progress_percent"
                            ],
                            "stage": None,
                            "error": None,
                        },
                    )
                    return
                size = int(self.headers.get("Content-Length", "0"))
                if not 0 < size <= 150 * 1024 * 1024:
                    raise ValueError("The upload is empty or exceeds 150 MB.")
                value = json.loads(self.rfile.read(size))
                if self.path == "/api/local/patients":
                    result = storage.patient(value)
                elif self.path == "/api/local/studies":
                    result = storage.upload(value)
                    load_local_studies()
                else:
                    self.send_json(404, {"error": "Unknown local storage endpoint."})
                    return
                self.send_json(200, result)
            except (ValueError, KeyError, TypeError) as error:
                self.send_json(400, {"error": str(error)})

        def send_json(self, status: int, body: object) -> None:
            encoded = json.dumps(body, allow_nan=False, separators=(",", ":")).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(encoded)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(encoded)

        def do_GET(self) -> None:
            host = self.headers.get("Host", "").lower()
            if host not in {f"127.0.0.1:{port}", f"localhost:{port}"}:
                self.send_error(403)
                return
            path = urlsplit(self.path).path
            if path == "/api/gcg":
                query = parse_qs(urlsplit(self.path).query)
                try:
                    snapshot = gcg.snapshot(
                        query.get("mode", ["auto"])[0],
                        query.get("board", ["http://unoq-sbc.local:7000"])[0],
                    )
                    self.send_json(200, snapshot)
                except ValueError as error:
                    self.send_json(400, {"error": str(error)})
                return
            if path == "/api/local/predictions":
                query = parse_qs(urlsplit(self.path).query)
                prediction = (
                    storage.prediction_run(query["run"][0])
                    if "run" in query
                    else storage.prediction(query.get("study", [""])[0])
                )
                self.send_json(200, prediction)
                return
            if path == "/api/dataset/service/v1/health":
                self.send_json(
                    200,
                    {
                        "checkedAt": "",
                        "ok": inference.model_error is None,
                        "api": {"ok": True, "version": "local"},
                        "model": {
                            "ok": model_path.is_file()
                            and inference.model_error is None,
                            "name": model_path.stem,
                            "version": "epoch-05",
                            "device": str(
                                inference.device or "loads on first analysis"
                            ),
                        },
                        "supabase": {"ok": True, "error": None},
                        "predictionWorker": {
                            "ok": True,
                            "queued": 0,
                            "running": 0,
                            "workers": 1,
                        },
                        "summaryWorker": {
                            "ok": True,
                            "queued": 0,
                            "running": 0,
                            "workers": 1,
                        },
                    },
                )
                return
            diagnostic_match = re.fullmatch(
                rf"/api/dataset/service/v1/studies/({RECORD_ID}|[a-f0-9]{{32}})/diagnostics",
                path,
            )
            if diagnostic_match:
                prediction = storage.prediction(diagnostic_match[1])
                run = prediction["run"] if prediction else None
                self.send_json(
                    200,
                    {
                        "checkedAt": "",
                        "service": {
                            "modelLoaded": inference.model is not None,
                            "databaseConfigured": True,
                            "model": model_path.stem,
                            "version": "local",
                        },
                        "run": {
                            "id": run["id"],
                            "status": run["status"],
                            "progressPercent": run["progress_percent"],
                            "error": run["error_message"],
                            "summaryStatus": run["summary_status"],
                            "summaryProgressPercent": run["summary_progress_percent"],
                            "summaryStage": None,
                            "summaryError": None,
                            "summaryUpdatedAt": None,
                        }
                        if run
                        else None,
                        "summaryWorker": {
                            "configuredWorkers": 1,
                            "runningJobs": 0,
                            "queuedJobs": 0,
                            "runState": "idle",
                            "queuePosition": None,
                        },
                    },
                )
                return
            if path == "/api/local/patients":
                self.send_json(200, storage.patients())
                return
            if path == "/api/local/studies":
                self.send_json(
                    200,
                    [
                        {**row, "prediction": storage.prediction(row["id"])}
                        for row in load_local_studies()
                    ],
                )
                return
            if path == "/api/dataset":
                self.send_json(
                    200,
                    [
                        {**row, "prediction": storage.prediction(row["id"])}
                        for row in catalog
                    ],
                )
                return
            service_match = re.fullmatch(
                rf"/api/dataset/service/v1/studies/({RECORD_ID}|[a-f0-9]{{32}})/(signal|timeline|summary)",
                path,
            )
            if service_match and service_match[1] in archive.records:
                record_id, operation = service_match.groups()
                prediction = storage.prediction(record_id)
                if prediction and prediction["run"]["status"] == "completed":
                    if operation == "timeline":
                        self.send_json(200, prediction_timeline(record_id, prediction))
                        return
                    if operation == "summary":
                        self.send_json(200, model_summary(record_id, prediction))
                        return
                if len(record_id) == 32:
                    record = archive.records[record_id]
                    channel = record.channels[0]
                    query = parse_qs(urlsplit(self.path).query)
                    if operation == "signal":
                        try:
                            minute = int(query.get("minute", ["0"])[0])
                            raw, filtered, peaks, bpm = local_signal_features(
                                record_id, minute
                            )
                            mode = query.get("mode", ["raw"])[0]
                            values = filtered if mode == "filtered" else raw
                            self.send_json(
                                200,
                                {
                                    "uploadId": record_id,
                                    "minuteIndex": minute,
                                    "samplingRateHz": 100,
                                    "unit": channel.unit,
                                    "mode": mode,
                                    "lead": "ECG",
                                    "samples": [
                                        float(v) if math.isfinite(v) else None
                                        for v in values
                                    ],
                                    "rPeakSamples": peaks,
                                    "rPeakSource": "xqrs",
                                    "estimatedBpm": bpm,
                                    "apneaAnnotationsAvailable": False,
                                    "apneaIntervals": [],
                                },
                            )
                        except ValueError as error:
                            self.send_json(400, {"error": str(error)})
                    elif operation == "timeline":
                        self.send_json(200, archive.timeline(record_id))
                    else:
                        self.send_json(
                            409,
                            {
                                "error": "Upload saved locally. Full analysis requires the trained model checkpoint."
                            },
                        )
                    return
                if operation == "timeline":
                    self.send_json(200, archive.timeline(record_id))
                elif operation == "summary":
                    self.send_json(200, archive.summary(record_id))
                else:
                    query = parse_qs(urlsplit(self.path).query)
                    try:
                        value = archive.minute(
                            record_id, 0, int(query.get("minute", ["0"])[0])
                        )
                    except ValueError as error:
                        self.send_json(400, {"error": str(error)})
                        return
                    mode = query.get("mode", ["raw"])[0]
                    if mode == "filtered":
                        sos = butter(
                            4, [0.5, 40], btype="bandpass", fs=100, output="sos"
                        )
                        if len(value["samples"]) > 30:
                            value["samples"] = sosfiltfilt(
                                sos, value["samples"]
                            ).tolist()
                    rr = np.diff(value["rPeakSamples"]) / 100
                    valid_rr = rr[(rr >= 0.3) & (rr <= 2.0)]
                    value.update(
                        mode=mode,
                        lead="ECG",
                        rPeakSource="qrs_annotation",
                        estimatedBpm=round(60 / float(np.median(valid_rr)))
                        if valid_rr.size >= 2
                        else None,
                        apneaAnnotationsAvailable=True,
                        apneaIntervals=archive.intervals(record_id),
                    )
                    self.send_json(200, value)
                return
            if not path.startswith("/api/"):
                if path in {
                    "/detail",
                    "/summary",
                    "/processing",
                    "/upload",
                    "/activity",
                    "/gcg",
                }:
                    self.path = path + ".html"
                super().do_GET()
                return

            match = re.fullmatch(
                rf"/api/dataset/({RECORD_ID})/(\d{{1,6}})/(\d{{1,6}})", path
            )
            if not match or match[1] not in archive.records:
                self.send_json(404, {"error": "Recording not found."})
                return
            try:
                minute = archive.minute(match[1], int(match[2]), int(match[3]))
            except ValueError as error:
                self.send_json(400, {"error": str(error)})
                return
            self.send_json(200, minute)

    with ThreadingHTTPServer(("127.0.0.1", port), Handler) as server:
        print(
            f"POSA dataset ready at http://127.0.0.1:{port}/ ({len(catalog)} recordings)",
            flush=True,
        )
        server.serve_forever()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path, help="Local Apnea-ECG ZIP file")
    parser.add_argument(
        "--web-dir", type=Path, default=Path("dist"), help="Exported POSA web folder"
    )
    parser.add_argument("--port", type=int, default=8081)
    parser.add_argument(
        "--data-dir", type=Path, default=Path(__file__).resolve().parents[1] / "data"
    )
    args = parser.parse_args()
    if not (args.web_dir / "index.html").is_file():
        parser.error(
            f"{args.web_dir} has no index.html. Export the POSA dataset web build first."
        )

    with TemporaryDirectory(
        prefix="posa-dataset-", dir=args.web_dir.resolve().parent
    ) as cache:
        try:
            dataset = ApneaArchive(args.archive.resolve(), Path(cache))
            serve(dataset, args.web_dir.resolve(), args.port, args.data_dir)
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()

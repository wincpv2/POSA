"""Read the UNO Q API contract supplied in GCG.zip, with a labeled mock backup."""

import json
import math
import time
from concurrent.futures import ThreadPoolExecutor
from ipaddress import ip_address
from threading import Lock
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


def numeric(value):
    return (
        float(value)
        if isinstance(value, (int, float)) and math.isfinite(value)
        else None
    )


def mock_snapshot(reason=None):
    now = time.monotonic()
    last = int(now * 100)
    samples = []
    for index in range(last - 899, last + 1):
        seconds = index / 100
        phase = seconds * 2 * math.pi * 1.2
        beat = math.sin(phase) + 0.34 * math.sin(2 * phase + 0.35)
        samples.append(
            {
                "t": index * 10,
                "gx": 0.17 * beat,
                "gy": 0.12 * math.sin(phase + 0.9),
                "gz": 0.15 * math.sin(phase - 0.55),
                "ax": 0.012 * math.sin(seconds * 0.7),
                "ay": 0.009 * math.sin(seconds * 0.41),
                "az": 1 + 0.008 * math.sin(seconds * 0.25),
            }
        )
    return {
        "source": "mock",
        "status": "backup" if reason else "demo",
        "samples": samples,
        "bpm": 72.0,
        "sampleRateHz": 100,
        "quality": 0.96,
        "model": "Simulated signal",
        "updatedAt": time.time(),
        "error": reason,
    }


class GcgBridge:
    def __init__(self):
        self.lock = Lock()
        self.last_seen = {}
        self.readings = {}
        self.worker = ThreadPoolExecutor(max_workers=2, thread_name_prefix="gcg-sensor")

    def _fetch(self, board, endpoint):
        request = Request(board + endpoint, headers={"Accept": "application/json"})
        with urlopen(request, timeout=1.2) as response:
            if response.status != 200:
                raise ValueError(f"Sensor returned HTTP {response.status}.")
            value = json.loads(response.read(2 * 1024 * 1024))
            if not isinstance(value, dict):
                raise TypeError("Sensor returned an invalid response.")
            return value

    def _live(self, board):
        with ThreadPoolExecutor(max_workers=3) as worker:
            requests = {
                endpoint: worker.submit(self._fetch, board, endpoint)
                for endpoint in ("/live", "/hr", "/diag")
            }
            live = requests["/live"].result()
            optional = {}
            for endpoint in ("/hr", "/diag"):
                try:
                    optional[endpoint] = requests[endpoint].result()
                except (OSError, ValueError, TypeError):
                    optional[endpoint] = {}
        samples = []
        for row in live.get("samples", [])[-900:]:
            if not isinstance(row, dict):
                continue
            sample = {
                key: numeric(row.get(key))
                for key in ("t", "gx", "gy", "gz", "ax", "ay", "az")
            }
            if sample["t"] is not None and any(
                sample[key] is not None for key in ("gx", "gy", "gz")
            ):
                samples.append(sample)
        if not samples:
            raise ValueError("Sensor is reachable and waiting for motion samples.")
        timestamp = samples[-1]["t"]
        now = time.monotonic()
        with self.lock:
            previous, changed_at = self.last_seen.get(board, (None, now))
            if timestamp != previous:
                changed_at = now
            if len(self.last_seen) > 32:
                self.last_seen.clear()
            self.last_seen[board] = (timestamp, changed_at)
        if now - changed_at > 3:
            raise ValueError("No new sensor samples for more than 3 seconds.")
        diagnostics = (
            optional["/hr"].get("diagnostics") or live.get("ml_diagnostics") or {}
        )
        quality = diagnostics.get("quality") or {}
        bpm = next(
            (
                numeric(diagnostics.get(key))
                for key in ("bpm", "bpm_smoothed", "bpm_raw")
                if numeric(diagnostics.get(key)) is not None
            ),
            None,
        )
        rate = numeric(optional["/diag"].get("gyro_rate_hz"))
        if rate is None and len(samples) > 1 and samples[-1]["t"] > samples[0]["t"]:
            rate = (len(samples) - 1) * 1000 / (samples[-1]["t"] - samples[0]["t"])
        clean = numeric(quality.get("clean_frac"))
        return {
            "source": "live",
            "status": "connected",
            "samples": samples,
            "bpm": bpm,
            "sampleRateHz": rate,
            "quality": min(1, max(0, clean)) if clean is not None else None,
            "model": "UNO Q GCG detector"
            if live.get("ml_enabled")
            else "Detector unavailable",
            "updatedAt": time.time(),
            "error": None,
        }

    def _refresh(self, board):
        try:
            reading, error = self._live(board), None
        except (OSError, ValueError, TypeError, AttributeError) as exception:
            reading, error = None, str(exception)
        with self.lock:
            self.readings[board] = (reading, error, time.monotonic(), False)

    def snapshot(self, mode, board):
        if mode not in {"auto", "live", "mock"}:
            raise ValueError("Choose Auto, Sensor, or Mock mode.")
        if mode == "mock":
            return mock_snapshot()
        parsed = urlsplit(board)
        hostname = parsed.hostname or ""
        try:
            local_host = (
                ip_address(hostname).is_private or ip_address(hostname).is_loopback
            )
        except ValueError:
            local_host = hostname == "localhost" or hostname.endswith(".local")
        if (
            parsed.scheme not in {"http", "https"}
            or not local_host
            or parsed.username
            or parsed.password
            or parsed.path not in {"", "/"}
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError(
                "Enter the local UNO Q address, such as http://unoq-sbc.local:7000."
            )
        board = board.rstrip("/")
        now = time.monotonic()
        with self.lock:
            reading, reason, checked, pending = self.readings.get(
                board, (None, "Connecting to the sensor.", 0, False)
            )
            if not pending and now - checked >= 1:
                self.readings[board] = (reading, reason, checked, True)
                self.worker.submit(self._refresh, board)
        if reading and now - checked < 3:
            return reading
        reason = reason or "Waiting for fresh sensor data."
        if mode == "auto":
            return mock_snapshot(reason)
        return {
            "source": "unavailable",
            "status": "offline",
            "samples": [],
            "bpm": None,
            "sampleRateHz": None,
            "quality": None,
            "model": "Unavailable",
            "updatedAt": time.time(),
            "error": reason,
        }

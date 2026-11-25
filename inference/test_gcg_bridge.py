import json
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch

from inference.gcg_bridge import GcgBridge, mock_snapshot


class GcgBridgeTest(unittest.TestCase):
    def test_mock_is_labeled_and_has_all_sensor_channels(self):
        snapshot = mock_snapshot("Sensor offline")
        self.assertEqual(snapshot["source"], "mock")
        self.assertEqual(snapshot["status"], "backup")
        self.assertEqual(len(snapshot["samples"]), 900)
        self.assertEqual(
            set(snapshot["samples"][0]), {"t", "gx", "gy", "gz", "ax", "ay", "az"}
        )

    def test_live_api_retains_zero_quality_and_returns_real_bpm(self):
        class Sensor(BaseHTTPRequestHandler):
            def do_GET(self):
                bodies = {
                    "/live": {
                        "samples": [
                            {"t": 100, "gx": 0.1, "gy": 0.2, "gz": 0.3},
                            {"t": 110, "gx": 0.2, "gy": 0.3, "gz": 0.4},
                        ],
                        "ml_enabled": True,
                    },
                    "/hr": {"diagnostics": {"bpm": 83, "quality": {"clean_frac": 0}}},
                    "/diag": {"gyro_rate_hz": 100},
                }
                body = json.dumps(bodies[self.path]).encode()
                self.send_response(200)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *args):
                pass

        server = ThreadingHTTPServer(("127.0.0.1", 0), Sensor)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        bridge = GcgBridge()
        try:
            reading = bridge._live(f"http://127.0.0.1:{server.server_port}")
            self.assertEqual(reading["source"], "live")
            self.assertEqual(reading["bpm"], 83)
            self.assertEqual(reading["quality"], 0)
            with (
                patch(
                    "inference.gcg_bridge.time.monotonic",
                    return_value=time.monotonic() + 5,
                ),
                self.assertRaisesRegex(ValueError, "No new sensor samples"),
            ):
                bridge._live(f"http://127.0.0.1:{server.server_port}")
        finally:
            bridge.worker.shutdown()
            server.shutdown()
            server.server_close()
            thread.join()

    def test_offline_auto_uses_mock_and_sensor_only_stays_unavailable(self):
        bridge = GcgBridge()
        with patch.object(bridge, "_live", side_effect=OSError("Sensor offline")):
            try:
                self.assertEqual(
                    bridge.snapshot("auto", "http://127.0.0.1:7000")["source"], "mock"
                )
                self.assertEqual(
                    bridge.snapshot("live", "http://127.0.0.1:7000")["source"],
                    "unavailable",
                )
            finally:
                bridge.worker.shutdown()

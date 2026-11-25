import base64
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

import numpy as np
import wfdb

from inference.local_storage import LocalStorage


class LocalStorageTest(unittest.TestCase):
    def test_threshold_includes_exactly_fifty_percent(self):
        with TemporaryDirectory() as directory:
            storage = LocalStorage(Path(directory))
            values = [0.4999, 0.5, 0.5001]
            storage.save_prediction(
                "study",
                {"id": "run", "status": "completed"},
                [{"apnea_probability": value, "is_apnea": None} for value in values],
            )
            storage.apply_threshold(0.5)
            result = storage.prediction("study")
            self.assertEqual(
                [minute["is_apnea"] for minute in result["minutes"]],
                [False, True, True],
            )
            self.assertEqual(
                [minute["apnea_probability"] for minute in result["minutes"]], values
            )
            self.assertEqual(result["run"]["apnea_minutes"], 2)

    def test_prediction_recovery_keeps_completed_results(self):
        with TemporaryDirectory() as directory:
            storage = LocalStorage(Path(directory))
            storage.save_prediction(
                "active", {"id": "active-run", "status": "processing"}, []
            )
            completed = {"id": "completed-run", "status": "completed"}
            minutes = [{"minute_index": 0, "apnea_probability": 0.75, "is_apnea": True}]
            storage.save_prediction("done", completed, minutes)

            reopened = LocalStorage(Path(directory))
            reopened.interrupt_predictions()
            self.assertEqual(reopened.prediction("active")["run"]["status"], "failed")
            self.assertEqual(
                reopened.prediction_run("completed-run"),
                {"run": completed, "minutes": minutes},
            )

    def test_upload_survives_reopening_storage(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            wfdb.wrsamp(
                "sample",
                fs=100,
                units=["mV"],
                sig_name=["ECG"],
                p_signal=np.sin(np.arange(6000) / 10).reshape(-1, 1),
                fmt=["16"],
                write_dir=directory,
            )
            storage = LocalStorage(root / "data")
            patient = storage.patient({"subjectCode": "REC-1234-AB"})
            payload = {
                "patientId": patient["patientId"],
                "recordCode": "REC-1234-AB",
                "files": [
                    {
                        "name": f"sample.{extension}",
                        "data": base64.b64encode(
                            (root / f"sample.{extension}").read_bytes()
                        ).decode(),
                    }
                    for extension in ("hea", "dat")
                ],
            }
            upload = storage.upload(payload)
            reopened = LocalStorage(root / "data")
            self.assertEqual(reopened.studies()[0]["id"], upload["id"])
            self.assertEqual(reopened.studies()[0]["durationSeconds"], 60)
            self.assertEqual(reopened.patient({"subjectCode": "REC-1234-AB"}), patient)
            self.assertTrue((root / "data" / upload["id"] / "sample.dat").is_file())
            payload["files"][1]["name"] = "../escape.dat"
            with self.assertRaises(ValueError):
                reopened.upload(payload)
            self.assertEqual(len(reopened.studies()), 1)

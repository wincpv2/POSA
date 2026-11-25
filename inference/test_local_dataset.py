import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
from zipfile import ZipFile

import numpy as np
import wfdb

from inference.local_dataset import ApneaArchive


class ApneaArchiveTest(unittest.TestCase):
    def test_catalog_and_minute_keep_record_ids_and_reference_labels(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            cache = root / "cache"
            cache.mkdir()
            output = root / "sample.zip"
            ecg = (np.arange(6004, dtype=float) % 200).reshape((-1, 1)) / 200
            wfdb.wrsamp(
                "a01",
                fs=100,
                units=["mV"],
                sig_name=["ECG"],
                p_signal=ecg,
                fmt=["16"],
                adc_gain=[200],
                baseline=[0],
                write_dir=directory,
            )
            wfdb.wrann(
                "a01",
                "apn",
                np.array([0, 6000]),
                symbol=["N", "A"],
                write_dir=directory,
            )
            wfdb.wrann(
                "a01",
                "qrs",
                np.array([100, 6001]),
                symbol=["N", "N"],
                write_dir=directory,
            )
            with ZipFile(output, "w") as archive:
                for suffix in ("hea", "dat", "apn", "qrs"):
                    name = f"a01.{suffix}"
                    archive.write(root / name, f"recordings/{name}")
                archive.writestr("recordings/a01er.hea", "alternate header view")
                archive.writestr("other/a04.hea", "no signal file")

            dataset = ApneaArchive(output, cache)
            self.assertEqual([item["id"] for item in dataset.catalog()], ["a01"])
            summary = dataset.catalog()[0]
            self.assertEqual(summary["labelledMinutes"], 2)
            self.assertEqual(summary["apneaMinutes"], 1)
            self.assertFalse((cache / "a01.dat").exists())

            final_minute = dataset.minute("a01", 0, 1)
            self.assertEqual(final_minute["label"], "apnea")
            self.assertEqual(final_minute["samples"], [0.0, 0.005, 0.01, 0.015])
            self.assertEqual(final_minute["rPeakSamples"], [1])
            with self.assertRaisesRegex(ValueError, "Minute is outside this recording"):
                dataset.minute("a01", 0, 2)

    def test_duplicate_archive_members_are_rejected(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            output = root / "duplicate.zip"
            with ZipFile(output, "w") as archive:
                archive.writestr("first/a01.hea", "first header")
                archive.writestr("second/a01.hea", "second header")
            with self.assertRaisesRegex(ValueError, "more than one copy of a01.hea"):
                ApneaArchive(output, root)

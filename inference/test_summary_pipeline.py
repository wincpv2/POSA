from __future__ import annotations

import unittest
from unittest.mock import Mock, patch

import numpy as np

from inference import service
from inference.xqrs_worker import chunk_windows, core_peaks


class _Query:
    def __init__(self, rows: list[dict], updates: list[dict]):
        self.rows = rows
        self.updates = updates

    def select(self, *_args):
        return self

    def eq(self, *_args):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, *_args):
        return self

    def update(self, values: dict):
        self.updates.append(values)
        return self

    def execute(self):
        return Mock(data=self.rows)


class SummaryQueueTests(unittest.TestCase):
    def test_refresh_does_not_reset_an_active_summary(self):
        run_id = "active-run"
        row = {
            "id": run_id,
            "status": "completed",
            "summary_status": "processing",
            "summary_progress_percent": 46,
            "summary_stage": "Detecting R peaks (8/98 chunks)",
            "summary_error_message": None,
        }
        updates: list[dict] = []
        client = Mock()
        client.table.return_value = _Query([row], updates)
        service.active_summary_runs.add(run_id)
        try:
            with patch.object(service, "_bearer_token", return_value="token"), \
                    patch.object(service, "_authorized_study", return_value={"id": "upload"}), \
                    patch.object(service, "_storage_client", return_value=client):
                result = service.start_study_summary("upload", refresh=True, authorization="Bearer token")
            self.assertEqual(result["status"], "processing")
            self.assertEqual(result["progressPercent"], 46)
            self.assertEqual(result["stage"], "Detecting R peaks (8/98 chunks)")
            self.assertEqual(updates, [])
        finally:
            service.active_summary_runs.discard(run_id)


class XqrsChunkTests(unittest.TestCase):
    def test_chunk_ranges_cover_record_with_context(self):
        self.assertEqual(
            chunk_windows(610 * 100, 100),
            [
                (0, 30_000, 0, 31_500),
                (30_000, 60_000, 28_500, 61_000),
                (60_000, 61_000, 58_500, 61_000),
            ],
        )

    def test_overlapping_peaks_are_owned_by_one_core(self):
        peaks = core_peaks(np.array([1_499, 1_500, 1_510]), 28_500, 30_000, 60_000)
        np.testing.assert_array_equal(peaks, np.array([30_000, 30_010]))

    def test_chunked_detector_works_through_windows_process_pool(self):
        sample_rate = 100
        count = 310 * sample_rate
        signal = np.zeros(count, dtype=np.float64)
        signal[::sample_rate] = 1.0
        progress: list[tuple[str, int]] = []

        peaks = service._detect_full_night_xqrs(signal, lambda stage, percent: progress.append((stage, percent)))

        self.assertGreater(len(peaks), 0)
        self.assertTrue(np.all(np.diff(peaks) > 0))
        self.assertEqual(len(progress), 2)
        self.assertEqual(progress[-1][1], 67)
        self.assertIn("2/2 chunks", progress[-1][0])


if __name__ == "__main__":
    unittest.main()

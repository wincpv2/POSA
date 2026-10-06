from __future__ import annotations

import numpy as np
from wfdb import processing


CHUNK_SECONDS = 300
CONTEXT_SECONDS = 15


def chunk_windows(sample_count: int, fs: int) -> list[tuple[int, int, int, int]]:
    """Return core and context ranges for bounded full-night QRS detection."""
    chunk_samples = CHUNK_SECONDS * fs
    context_samples = CONTEXT_SECONDS * fs
    windows = []
    for core_start in range(0, sample_count, chunk_samples):
        core_end = min(sample_count, core_start + chunk_samples)
        windows.append((
            core_start,
            core_end,
            max(0, core_start - context_samples),
            min(sample_count, core_end + context_samples),
        ))
    return windows


def core_peaks(local_peaks: np.ndarray, input_start: int, core_start: int, core_end: int) -> np.ndarray:
    """Map chunk peaks to full-record indices and discard overlap detections."""
    absolute = np.asarray(local_peaks, dtype=np.int64) + input_start
    return absolute[(absolute >= core_start) & (absolute < core_end)]


def detect_xqrs_chunk(signal: np.ndarray, fs: int) -> np.ndarray:
    return np.asarray(processing.xqrs_detect(signal, fs=fs, verbose=False), dtype=np.int64)

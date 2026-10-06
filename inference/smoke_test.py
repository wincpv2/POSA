from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import wfdb

from inference.model import SAMPLE_RATE_HZ, load_model, predict_minutes, preprocess_signal

SPLIT_SPECS = {
    0: (0, 0), 1: (3, 3), 2: (1, 1), 3: (1, 1), 4: (1, 1),
    5: (1, 1), 6: (1, 1), 7: (1, 1), 8: (2, 2), 9: (1, 1), 10: (0, 0),
}


def main() -> None:
    parser = argparse.ArgumentParser(description="Smoke-check the trained model on four reserved Test records.")
    parser.add_argument("--data-dir", required=True, type=Path, help="Directory containing WFDB .hea/.dat and .apn files.")
    parser.add_argument("--model", required=True, type=Path, help="Path to the trained .pt checkpoint.")
    args = parser.parse_args()
    data_dir = args.data_dir.resolve()
    records = sorted({path.stem for path in data_dir.glob("*.apn")})
    if not records:
        raise SystemExit(f"No .apn annotations found in {data_dir}.")
    ratios: dict[str, float] = {}
    for rec in records:
        ann = wfdb.rdann(str(data_dir / rec), "apn")
        if ann.symbol:
            ratios[rec] = sum(symbol == "A" for symbol in ann.symbol) / len(ann.symbol)
    def get_bin(ratio: float) -> int:
        if ratio == 0:
            return 0
        for index in range(1, 10):
            if ratio <= index / 10:
                return index
        return 10

    bins: dict[int, list[str]] = {index: [] for index in range(11)}
    for rec, ratio in ratios.items():
        bins[get_bin(ratio)].append(rec)
    test_records: list[str] = []
    for group, (n_val, n_test) in SPLIT_SPECS.items():
        shuffled = sorted(bins[group])
        # Match pandas Series.sample(frac=1, random_state=42), as used in the training notebook.
        shuffled = np.random.RandomState(42).choice(shuffled, size=len(shuffled), replace=False).tolist()
        test_records.extend(shuffled[n_val:n_val + n_test])
    usable_test_records = [
        rec for rec in test_records
        if (data_dir / f"{rec}.hea").is_file() and (data_dir / f"{rec}.dat").is_file()
    ]
    print(f"Recreated split from {len(ratios)} annotations: {len(test_records)} Test entries, {len(usable_test_records)} with matching .hea/.dat.")
    print(f"Test order: {', '.join(test_records)}")
    if len(usable_test_records) < 4:
        raise SystemExit("Fewer than four Test records have matching .hea/.dat files.")
    model, device = load_model(args.model)
    for rec in usable_test_records[:4]:
        signal, fields = wfdb.rdsamp(str(data_dir / rec))
        if not np.isclose(fields["fs"], SAMPLE_RATE_HZ):
            raise SystemExit(f"{rec}: expected 100 Hz, got {fields['fs']}.")
        windows = preprocess_signal(signal[:, 0])
        probabilities = predict_minutes(model, device, windows)
        print(f"{rec}: {len(probabilities)} complete minutes inferred; probability range {min(probabilities):.4f}-{max(probabilities):.4f}")
    print("Smoke check passed for the first four signal records in the recreated held-out Test split.")


if __name__ == "__main__":
    main()

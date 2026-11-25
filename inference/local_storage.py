"""Persist patient metadata and WFDB uploads in the project data directory."""

import base64
import json
import re
import shutil
import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import uuid4

import wfdb


class LocalStorage:
    def __init__(self, root: Path):
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        with self.connect() as database:
            database.execute(
                "create table if not exists patients (id text primary key, code text unique, metadata text)"
            )
            database.execute(
                "create table if not exists studies (id text primary key, metadata text)"
            )
            database.execute(
                "create table if not exists predictions (study_id text primary key, run text not null, minutes text not null)"
            )

    @contextmanager
    def connect(self):
        database = sqlite3.connect(self.root / "posa.sqlite3")
        try:
            with database:
                yield database
        finally:
            database.close()

    def patients(self):
        with self.connect() as database:
            return [
                json.loads(row[0])
                for row in database.execute("select metadata from patients")
            ]

    def patient(self, value):
        code = value.get("subjectCode", "").strip()
        if not code or len(code) > 100:
            raise ValueError("Enter a valid subject code.")
        with self.connect() as database:
            existing = database.execute(
                "select metadata from patients where code = ?", (code,)
            ).fetchone()
            if existing:
                return json.loads(existing[0])
            patient = {
                "patientId": uuid4().hex,
                "subjectCode": code,
                "sex": value.get("sex"),
                "bmi": value.get("bmi"),
                "dateOfBirth": value.get("dateOfBirth"),
            }
            database.execute(
                "insert into patients values (?, ?, ?)",
                (patient["patientId"], code, json.dumps(patient)),
            )
            return patient

    def studies(self):
        with self.connect() as database:
            return [
                json.loads(row[0])
                for row in database.execute(
                    "select metadata from studies order by rowid desc"
                )
            ]

    def prediction(self, study_id):
        with self.connect() as database:
            row = database.execute(
                "select run, minutes from predictions where study_id = ?", (study_id,)
            ).fetchone()
            return (
                {"run": json.loads(row[0]), "minutes": json.loads(row[1])}
                if row
                else None
            )

    def prediction_run(self, run_id):
        with self.connect() as database:
            rows = database.execute("select run, minutes from predictions").fetchall()
            for run, minutes in rows:
                if json.loads(run)["id"] == run_id:
                    return {"run": json.loads(run), "minutes": json.loads(minutes)}
        return None

    def apply_threshold(self, threshold: float):
        """Reclassify saved probabilities without rerunning the model."""
        with self.connect() as database:
            rows = database.execute(
                "select study_id, run, minutes from predictions"
            ).fetchall()
            for study_id, encoded_run, encoded_minutes in rows:
                run = json.loads(encoded_run)
                if run["status"] != "completed":
                    continue
                minutes = json.loads(encoded_minutes)
                for minute in minutes:
                    minute["is_apnea"] = minute["apnea_probability"] >= threshold
                positive = sum(minute["is_apnea"] for minute in minutes)
                run.update(
                    apnea_minutes=positive,
                    apnea_percent=positive * 100 / len(minutes) if minutes else None,
                )
                database.execute(
                    "update predictions set run = ?, minutes = ? where study_id = ?",
                    (json.dumps(run), json.dumps(minutes), study_id),
                )

    def save_prediction(self, study_id, run, minutes):
        with self.connect() as database:
            database.execute(
                "insert into predictions values (?, ?, ?) on conflict(study_id) do update set run=excluded.run, minutes=excluded.minutes",
                (study_id, json.dumps(run), json.dumps(minutes)),
            )

    def interrupt_predictions(self):
        with self.connect() as database:
            rows = database.execute("select study_id, run from predictions").fetchall()
            for study_id, encoded in rows:
                run = json.loads(encoded)
                if run["status"] in {"queued", "processing"}:
                    run.update(
                        status="failed",
                        error_message="The local server restarted during analysis. Retry analysis.",
                    )
                    database.execute(
                        "update predictions set run = ? where study_id = ?",
                        (json.dumps(run), study_id),
                    )

    def upload(self, value):
        study_id = uuid4().hex
        with TemporaryDirectory(dir=self.root, prefix="upload-") as temporary:
            staging = Path(temporary)
            names = []
            for file in value.get("files", []):
                name = file.get("name", "")
                if (
                    not re.fullmatch(r"[A-Za-z0-9_-]+\.(hea|dat|apn|qrs)", name)
                    or name in names
                ):
                    raise ValueError(
                        "Choose a WFDB header and matching signal with simple file names."
                    )
                names.append(name)
                (staging / name).write_bytes(
                    base64.b64decode(file["data"], validate=True)
                )
            headers = [name for name in names if name.endswith(".hea")]
            if len(headers) != 1:
                raise ValueError("Choose exactly one WFDB header.")
            stem = Path(headers[0]).stem
            header = wfdb.rdheader(str(staging / stem))
            if header.fs != 100 or header.sig_len <= 0 or "ECG" not in header.sig_name:
                raise ValueError(
                    "The recording must contain an ECG channel sampled at 100 Hz."
                )
            for name in header.file_name:
                if name not in names or Path(name).name != name:
                    raise ValueError(
                        "The header references a signal file that was not uploaded."
                    )
            wfdb.rdsamp(
                str(staging / stem), sampfrom=0, sampto=min(100, header.sig_len)
            )
            patient = next(
                (
                    row
                    for row in self.patients()
                    if row["patientId"] == value.get("patientId")
                ),
                None,
            )
            if not patient:
                raise ValueError("Patient not found. Select the patient again.")
            metadata = {
                "id": study_id,
                "stem": stem,
                "patient": patient,
                "recordCode": value.get("recordCode", stem),
                "createdAt": datetime.now(UTC).isoformat(),
                "ageYears": value.get("ageYears"),
                "durationSeconds": header.sig_len / header.fs,
                "files": names,
            }
            destination = self.root / study_id
            destination.mkdir()
            try:
                for name in names:
                    shutil.copyfile(staging / name, destination / name)
                with self.connect() as database:
                    database.execute(
                        "insert into studies values (?, ?)",
                        (study_id, json.dumps(metadata)),
                    )
            except Exception:
                shutil.rmtree(destination)
                raise
            return {"id": study_id, "clinicianId": "local-archive-reader"}

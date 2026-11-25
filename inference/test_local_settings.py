import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

from fastapi import HTTPException

from inference import service


class LocalSettingsTest(unittest.TestCase):
    def test_stale_hosted_settings_are_ignored(self):
        with tempfile.TemporaryDirectory() as directory:
            checkpoint = Path(directory) / "model.pt"
            checkpoint.touch()
            environment = {
                "POSA_MODEL_PATH": str(checkpoint),
                "POSA_DATABASE_SERVICE_ROLE_KEY": "local-test-key",
                "SUPABASE_URL": "https://database.example.com",
            }
            with patch.dict(os.environ, environment, clear=True):
                self.assertEqual(
                    service._settings(),
                    (str(checkpoint), "http://127.0.0.1:54321", "local-test-key"),
                )

    def test_explicit_hosted_database_is_rejected(self):
        environment = {"POSA_DATABASE_URL": "https://database.example.com"}
        with (
            patch.dict(os.environ, environment, clear=True),
            self.assertRaisesRegex(
                RuntimeError, "POSA_DATABASE_URL must be a local HTTP origin"
            ),
        ):
            service._settings()

    def test_local_email_session_can_start_analysis_for_its_own_study(self):
        client = Mock()
        user = SimpleNamespace(id="owner", app_metadata={"provider": "email"})
        client.auth.get_user.return_value = SimpleNamespace(user=user)
        study = {"clinician_id": "owner", "deleted_at": None}
        lookup = (
            client.table.return_value.select.return_value.eq.return_value.maybe_single
        )
        lookup.return_value.execute.return_value = SimpleNamespace(data=study)

        with patch.object(service, "admin", client):
            self.assertEqual(
                service._authorized_study("study", "token", require_owner=True), study
            )
            user.id = "other-clinician"
            with self.assertRaises(HTTPException) as error:
                service._authorized_study("study", "token", require_owner=True)
            self.assertEqual(error.exception.status_code, 403)

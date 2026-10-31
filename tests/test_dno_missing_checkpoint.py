import pytest
from fastapi import HTTPException

from backend.app.api.routes import dno


@pytest.mark.parametrize("endpoint", [dno.get_dno_health, dno.get_available_events])
def test_missing_dno_checkpoint_returns_service_unavailable_without_traceback(endpoint, monkeypatch):
    def missing_checkpoint(*args, **kwargs):
        raise FileNotFoundError("checkpoint missing")

    monkeypatch.setattr(dno.DNOInferenceService, "get_instance", missing_checkpoint)
    with pytest.raises(HTTPException) as error:
        endpoint()
    assert error.value.status_code == 503
    assert error.value.detail == "DNO model checkpoint is unavailable."

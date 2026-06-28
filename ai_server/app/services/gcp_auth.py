"""GCP ADC 토큰/quota 프로젝트 공용 헬퍼 (translate·stt 공유)."""
import google.auth
from google.auth.transport.requests import Request

from app import config

_creds = None


def token_and_project():
    global _creds
    if _creds is None:
        _creds, _ = google.auth.default()
    if not _creds.valid:
        _creds.refresh(Request())
    quota_project = getattr(_creds, "quota_project_id", None) or config.GCP_PROJECT or None
    return _creds.token, quota_project

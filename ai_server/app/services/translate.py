"""Google Cloud Translation v2 (ADC 인증). 자막 이해 보조용 실시간 번역.

소스 언어 자동 감지. 배치(여러 문장 한 번에). export 와 무관(편집 보조).
"""
import google.auth
import httpx
from google.auth.transport.requests import Request

from app import config

_URL = "https://translation.googleapis.com/language/translate/v2"
_creds = None


def _token_and_project():
    global _creds
    if _creds is None:
        _creds, _ = google.auth.default()
    if not _creds.valid:
        _creds.refresh(Request())
    quota_project = getattr(_creds, "quota_project_id", None) or config.GCP_PROJECT or None
    return _creds.token, quota_project


def translate(texts: list[str], target: str) -> list[str]:
    if not texts:
        return []
    token, quota_project = _token_and_project()
    headers = {"Authorization": f"Bearer {token}"}
    if quota_project:
        headers["x-goog-user-project"] = quota_project
    with httpx.Client(timeout=30.0) as client:
        resp = client.post(_URL, headers=headers, json={"q": texts, "target": target, "format": "text"})
        resp.raise_for_status()
        data = resp.json()
    return [t["translatedText"] for t in data["data"]["translations"]]

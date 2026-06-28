"""Google Cloud Speech-to-Text v2 (Chirp 2) — 단어 단위 타임스탬프 전사.

ADC 인증, language_codes=["auto"](소스 자동감지), enable_word_time_offsets.
인라인 content(짧은 오디오, 숏폼 대상). 긴 오디오는 추후 GCS batchRecognize.
"""
import httpx

from app import config
from app.services.gcp_auth import token_and_project


def _offset_to_us(s) -> int:
    # "1.200s" / "0s" / 0 형태 → µs
    if s is None:
        return 0
    if isinstance(s, (int, float)):
        return int(float(s) * 1_000_000)
    return int(round(float(str(s).rstrip("s")) * 1_000_000))


def transcribe_words(audio_base64: str) -> dict:
    """오디오 → {"words": [{"text","start_us","end_us"}], "language": "ko"}."""
    token, project = token_and_project()
    project = project or config.GCP_PROJECT
    loc = config.STT_LOCATION
    url = (
        f"https://{loc}-speech.googleapis.com/v2/projects/{project}"
        f"/locations/{loc}/recognizers/_:recognize"
    )
    body = {
        "config": {
            "model": config.STT_MODEL,
            "languageCodes": ["auto"],
            "features": {"enableWordTimeOffsets": True, "enableAutomaticPunctuation": True},
            "autoDecodingConfig": {},
        },
        "content": audio_base64,
    }
    headers = {"Authorization": f"Bearer {token}"}
    if project:
        headers["x-goog-user-project"] = project
    with httpx.Client(timeout=300.0) as client:
        resp = client.post(url, headers=headers, json=body)
        resp.raise_for_status()
        data = resp.json()

    words = []
    language = "auto"
    for result in data.get("results", []):
        language = result.get("languageCode", language)
        alts = result.get("alternatives", [])
        if not alts:
            continue
        for w in alts[0].get("words", []):
            text = w.get("word", "")
            if not text:
                continue
            words.append(
                {
                    "text": text,
                    "start_us": _offset_to_us(w.get("startOffset")),
                    "end_us": _offset_to_us(w.get("endOffset")),
                }
            )
    return {"words": words, "language": language}

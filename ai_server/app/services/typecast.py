"""Typecast TTS (with-timestamps). 단일 줄 합성 → base64 + 문자 타이밍(µs).

✅ 실제 응답 스키마 확정(2026-06):
  audio(str base64) / audio_format(str) / audio_duration(float 초)
  words[{text,start,end}] / characters[{text,start,end}]  (start/end = 초)
granularity="char" → characters 채워짐.
"""
import re

import httpx

from app import config

_ENDPOINT = "https://api.typecast.ai/v1/text-to-speech/with-timestamps"
# 발음 가능한 글자(문자/숫자, 한글·일본어 포함). 없으면 TTS 불가.
_PRONOUNCEABLE = re.compile(r"[^\W_]", re.UNICODE)


def _sec_to_us(value) -> int:
    return int(round(float(value) * 1_000_000)) if value is not None else 0


def synthesize(tts_text: str, voice_id: str, language: str) -> dict:
    # 빈 텍스트 / 발음 가능한 글자 없는 줄(문장부호·기호만)은 Typecast가 거부
    # → 호출 없이 빈 결과 반환.
    if not tts_text or not _PRONOUNCEABLE.search(tts_text):
        return {"audio_base64": "", "audio_format": "wav", "duration_us": 0, "char_timings": []}

    lang = config.TYPECAST_LANG_MAP.get(language, "kor")
    payload = {
        "text": tts_text,
        "voice_id": voice_id,
        "model": config.TYPECAST_MODEL,
        "language": lang,
        "granularity": "char",
        # 속도/포맷은 공식 스키마상 output 객체 안. (top-level 은 무시됨)
        "output": {
            "audio_tempo": config.TTS_SPEED,      # 0.5~2.0
            "audio_format": config.TYPECAST_OUTPUT_FORMAT,
        },
    }
    headers = {"X-API-KEY": config.TYPECAST_API_KEY}
    with httpx.Client(timeout=120.0) as client:
        resp = client.post(_ENDPOINT, json=payload, headers=headers)
        if resp.status_code >= 400:
            # Typecast 가 준 실제 사유를 로그/예외에 노출
            try:
                detail = resp.json()
            except Exception:
                detail = resp.text
            preview = tts_text[:40] + ("…" if len(tts_text) > 40 else "")
            print(
                f"[typecast] {resp.status_code} voice={voice_id} len={len(tts_text)} "
                f"text='{preview}' detail={detail}",
                flush=True,
            )
            raise RuntimeError(f"typecast_{resp.status_code}: {detail}")
        data = resp.json()

    audio_b64 = data.get("audio") or data.get("audio_base64") or ""
    raw_timings = data.get("characters") or data.get("words") or []
    char_timings = [
        {
            "char": t.get("text") or t.get("char") or "",
            "start_us": _sec_to_us(t.get("start")),
            "end_us": _sec_to_us(t.get("end")),
        }
        for t in raw_timings
    ]

    if data.get("audio_duration") is not None:
        duration_us = _sec_to_us(data["audio_duration"])
    elif char_timings:
        duration_us = char_timings[-1]["end_us"]
    else:
        duration_us = 0

    return {
        "audio_base64": audio_b64,
        "audio_format": data.get("audio_format") or config.TYPECAST_OUTPUT_FORMAT,
        "duration_us": duration_us,
        "char_timings": char_timings,
    }

"""환경변수 단일 로딩 지점. 이름은 §1.9 식별자 사전과 1:1."""
import json
import os


def _json_env(name: str, default):
    raw = os.environ.get(name)
    if not raw:
        return default
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return default


# Gemini
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")

# Typecast
TYPECAST_API_KEY = os.environ.get("TYPECAST_API_KEY", "")
TYPECAST_MODEL = os.environ.get("TYPECAST_MODEL", "ssfm-v30")
TYPECAST_OUTPUT_FORMAT = os.environ.get("TYPECAST_OUTPUT_FORMAT", "mp3")
TTS_SPEED = float(os.environ.get("TTS_SPEED", "1.0"))
TYPECAST_VOICES = _json_env("TYPECAST_VOICES", [])
TYPECAST_LANG_MAP = _json_env("TYPECAST_LANG_MAP", {"ko": "kor", "ja": "jpn"})

# fal.ai
FAL_KEY = os.environ.get("FAL_KEY", "")
FAL_MODEL_IMAGE_T2I = os.environ.get("FAL_MODEL_IMAGE_T2I", "fal-ai/flux-pro/v1.1-ultra")
FAL_MODEL_IMAGE_REF = os.environ.get("FAL_MODEL_IMAGE_REF", "fal-ai/nano-banana/edit")
FAL_MODEL_VIDEO_T2V = os.environ.get("FAL_MODEL_VIDEO_T2V", "fal-ai/wan-25-preview/text-to-video")
FAL_MODEL_VIDEO_I2V = os.environ.get("FAL_MODEL_VIDEO_I2V", "fal-ai/wan-25-preview/image-to-video")

# Google Video Intelligence (샷 감지) · Speech-to-Text (자막2 전사)
GOOGLE_APPLICATION_CREDENTIALS = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "")
GCP_PROJECT = os.environ.get("GCP_PROJECT", "")
STT_LOCATION = os.environ.get("STT_LOCATION", "us-central1")
STT_MODEL = os.environ.get("STT_MODEL", "chirp_2")

# 리소스 폴더 (스타일 txt·참조 이미지 로딩)
MY_STYLES_DIR = os.environ.get("MY_STYLES_DIR", "/resources/my_styles")
MY_SAMPLES_DIR = os.environ.get("MY_SAMPLES_DIR", "/resources/my_samples")

WORKSPACE_DIR = os.environ.get("WORKSPACE_DIR", "/workspace")

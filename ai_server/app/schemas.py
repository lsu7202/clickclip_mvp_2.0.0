"""Wire 스키마(snake_case). §5 계약과 1:1. AI 서버는 변환 0."""
from typing import Literal, Optional

from pydantic import BaseModel

Language = Literal["ko", "ja"]


# ---- /scenes/split ----
class SceneSplitReq(BaseModel):
    script_text: str
    language: Language = "ko"


class SplitLine(BaseModel):
    line_number: int
    text: str


class SplitScene(BaseModel):
    scene_number: int
    subtitle1_lines: list[SplitLine]


class SceneSplitResp(BaseModel):
    scenes: list[SplitScene]


# ---- /scenes/semantic-split ----
class SemanticSplitReq(BaseModel):
    text: str
    language: Language = "ko"


class SemanticLine(BaseModel):
    text: str


class SemanticSplitResp(BaseModel):
    lines: list[SemanticLine]


# ---- /tts ----
class TtsReq(BaseModel):
    tts_text: str
    voice_id: str
    language: Language = "ko"


class CharTiming(BaseModel):
    char: str
    start_us: int
    end_us: int


class TtsResp(BaseModel):
    audio_base64: str
    audio_format: str
    duration_us: int
    char_timings: list[CharTiming]


# ---- /ai-media/generate ----
class AiMediaReq(BaseModel):
    media_type: Literal["image", "video"]
    style_id: Optional[str] = None
    situation_text: str
    reference_name: Optional[str] = None
    aspect_ratio: Optional[str] = None


class AiMediaResp(BaseModel):
    media_url: str
    source_type: Literal["ai_image", "ai_video"]
    width_px: int
    height_px: int
    duration_us: Optional[int] = None
    has_audio: bool = False


# ---- /translate ----
class TranslateReq(BaseModel):
    texts: list[str]
    target: str = "ko"


class TranslateResp(BaseModel):
    translations: list[str]


# ---- /video-analysis/process ----
class VideoAnalysisReq(BaseModel):
    video_base64: str
    language: Language = "ko"


class Shot(BaseModel):
    start_us: int
    end_us: int


class Caption(BaseModel):
    # 자막2 = 원본 소스 타임라인 기준 캡션(장면에 묶이지 않음)
    start_us: int
    end_us: int
    text: str
    ko: Optional[str] = None  # 검증용 한국어 gloss (목표가 ko면 None). export 미포함


class VideoAnalysisResp(BaseModel):
    shots: list[Shot]
    captions: list[Caption]

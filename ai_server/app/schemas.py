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


# ---- 롱폼: /script/generate · /scenes/split-longform · /longform/* ----
LongformCategory = Literal["economy", "war", "folktale"]


class ScriptGenReq(BaseModel):
    category: LongformCategory = "economy"
    topic: str
    description: str = ""
    language: Language = "ko"
    target_chars: Optional[int] = None  # 대본 목표 글자수(미지정 시 지침 기본 ~3,000자)


class ScriptGenResp(BaseModel):
    script: str


class LongformSplitReq(BaseModel):
    script_text: str
    language: Language = "ko"


class CharacterSheet(BaseModel):
    name: str
    description: str  # 고정 외형 묘사(영어) — 전 장면 동일 인물 일관성의 원천
    archetype: Optional[str] = None  # 일반 인물이면 스톡 아키타입 키, 실존/고유 인물이면 None


class CharacterExtractReq(BaseModel):
    script_text: str
    category: LongformCategory = "war"
    language: Language = "ko"
    archetype_names: list[str] = []  # 스톡 아키타입 후보(프론트 제공)


class CharacterExtractResp(BaseModel):
    characters: list[CharacterSheet]


class ScenePromptIn(BaseModel):
    scene_number: int
    text: str


class ScenePromptOut(BaseModel):
    scene_number: int
    prompt: str
    character_names: list[str] = []


class ImagePromptsReq(BaseModel):
    category: LongformCategory = "economy"
    language: Language = "ko"
    characters: list[CharacterSheet] = []
    scenes: list[ScenePromptIn]


class ImagePromptsResp(BaseModel):
    scenes: list[ScenePromptOut]


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
    speed: Optional[float] = None  # 미지정 시 env TTS_SPEED (롱폼은 1.0 권장)


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
    reference_name: Optional[str] = None  # my_samples 폴더 파일명
    reference_path: Optional[str] = None  # workspace 상대경로(캐릭터 레퍼런스/i2v 원본)
    aspect_ratio: Optional[str] = None
    duration_s: Optional[int] = None  # 영상 길이(초) — 모델 허용값으로 자동 스냅


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
    want_captions: bool = True  # 원본 자막(STT+교정)
    want_commentary: bool = False  # 해설 자막(전체 맥락 생성, 표시 전용)
    commentary_style: str = "docu"  # docu|fun|story|reaction|custom
    commentary_style_text: Optional[str] = None  # custom일 때 말투 예시


class Shot(BaseModel):
    start_us: int
    end_us: int


class Caption(BaseModel):
    # 원본 자막 = 원본 소스 타임라인 기준 캡션(장면에 묶이지 않음)
    start_us: int
    end_us: int
    text: str
    ko: Optional[str] = None  # 검증용 한국어 gloss (목표가 ko면 None). export 미포함


class VideoAnalysisResp(BaseModel):
    shots: list[Shot]
    captions: list[Caption]
    commentary: list[list[str]]  # 샷 순서 1:1 — 샷별 해설 줄 목록(빈 배열 허용)

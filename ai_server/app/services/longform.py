"""롱폼 생성 파이프라인(yt-ai-platform 이식): 대본 생성(그라운딩) → 파싱 → 캐릭터 시트 → 이미지 프롬프트.

프롬프트 자산(app/prompts/*.md)은 원본 구조를 유지(SPEC: 프롬프트 로직 수정 금지).
- script_{category}.md : 카테고리별 대본 지침 (경제=원본 그대로 / 전쟁·전래동화=동일 구조 DNA)
- parse_longform.md    : 1문장=1장면 + 호흡단위 자막, 원문 100% 일치 + 단어 경계 하드룰
- image_prompts_*.md   : 경제=사물만(원본) / character=캐릭터 레지스트리 기반(전쟁·동화)
- characters_extract.md: 영상별 등장인물 고정 외형 시트(동일 인물 일관성)
"""
import json
import os
import re

from google.genai import types
from pydantic import BaseModel

from app import config
from app.services import gemini

_PROMPTS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "prompts")

_LANG_NAME = {"ko": "Korean", "ja": "Japanese"}
_CHARACTER_CATEGORIES = {"war", "folktale"}  # 인물 허용 카테고리(경제는 사물만)


def _load(name: str) -> str:
    with open(os.path.join(_PROMPTS_DIR, name), "r", encoding="utf-8") as f:
        return f.read()


# ---- 1) 대본 생성 (Google 검색 그라운딩 — 구조화 출력과 병용 불가라 자유 텍스트) ----
def generate_script(category: str, topic: str, description: str, language: str, target_chars: int | None = None) -> str:
    instruction = _load(f"script_{category}.md")
    # 전래동화는 전승 이야기라 그라운딩 불필요, 경제·전쟁은 사실 검증에 필요
    tools = [] if category == "folktale" else [types.Tool(google_search=types.GoogleSearch())]
    prompt = (
        "Based on the given theme, please create a video narration script.\n"
        f"Output Language : {_LANG_NAME.get(language, 'Korean')}\n"
        f"topic : {topic}\n"
        f"description : {description}"
    )
    if target_chars:
        prompt += (
            f"\nTotal Length Override: Approximately {target_chars} characters."
            " This overrides the guideline's total length."
        )
    resp = gemini._get_client().models.generate_content(
        model=config.GEMINI_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(system_instruction=instruction, tools=tools),
    )
    return (resp.text or "").strip()


# ---- 2) 롱폼 파싱 (1문장=1장면, 호흡단위 줄, 원문 100%) ----
class _PSub(BaseModel):
    id: int
    text: str


class _PScene(BaseModel):
    id: int
    subtitles: list[_PSub]


class _Parsed(BaseModel):
    scenes: list[_PScene]


def split_longform(script_text: str, language: str) -> list[list[str]]:
    instruction = _load("parse_longform.md")
    prompt = f"language: {_LANG_NAME.get(language, 'Korean')}\nscript: {script_text}"
    resp = gemini._get_client().models.generate_content(
        model=config.GEMINI_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=instruction,
            response_mime_type="application/json",
            response_schema=_Parsed,
        ),
    )
    data = _Parsed.model_validate_json(resp.text)
    scenes = [[s.text for s in sc.subtitles if s.text and s.text.strip()] for sc in data.scenes]
    scenes = [lines for lines in scenes if lines]

    # 무결성 검증: 공백 제외 글자 시퀀스가 원문과 일치해야(누락·수정 방지)
    strip_ws = lambda s: re.sub(r"\s+", "", s)
    joined = strip_ws("".join(t for lines in scenes for t in lines))
    if joined != strip_ws(script_text):
        print(f"[longform] parse fidelity mismatch: {len(joined)} vs {len(strip_ws(script_text))} chars", flush=True)
    return scenes


# ---- 3) 캐릭터 시트 (동일 인물 일관성의 원천) ----
class _Character(BaseModel):
    name: str
    description: str
    archetype: str | None = None


class _Characters(BaseModel):
    characters: list[_Character]


def extract_characters(
    script_text: str, category: str, language: str, archetype_names: list[str] | None = None
) -> list[dict]:
    if category not in _CHARACTER_CATEGORIES:
        return []  # 경제는 사람 금지 규칙 → 캐릭터 없음
    instruction = _load("characters_extract.md")
    if archetype_names:
        instruction += (
            "\n\n# Archetype Rule\n"
            "For each character, additionally output an 'archetype' field:\n"
            f"- If the character is a GENERIC person/animal (not a specific named or historical figure), choose the closest archetype from this list: {', '.join(archetype_names)}\n"
            "- If the character is a specific/named/historical figure (e.g., 이순신), set archetype to null.\n"
            "- Archetype must be exactly one of the listed strings or null."
        )
    resp = gemini._get_client().models.generate_content(
        model=config.GEMINI_MODEL,
        contents=f"script:\n{script_text}",
        config=types.GenerateContentConfig(
            system_instruction=instruction,
            response_mime_type="application/json",
            response_schema=_Characters,
        ),
    )
    data = _Characters.model_validate_json(resp.text)
    return [c.model_dump() for c in data.characters]


# ---- 4) 장면별 이미지 프롬프트 (전체 맥락 1회) ----
class _ScenePrompt(BaseModel):
    scene_number: int
    prompt: str
    character_names: list[str] = []


class _ScenePrompts(BaseModel):
    scenes: list[_ScenePrompt]


def image_prompts(
    category: str, language: str, characters: list[dict], scenes: list[dict]
) -> list[dict]:
    """scenes: [{scene_number, text}] → [{scene_number, prompt, character_names}]"""
    use_chars = category in _CHARACTER_CATEGORIES and characters
    instruction = _load("image_prompts_character.md" if use_chars else "image_prompts_economy.md")

    registry = ""
    if use_chars:
        registry = "\n\n** Character Registry (use these exact descriptions verbatim) **\n" + "\n".join(
            f"- {c['name']}: {c['description']}" for c in characters
        )
    scenes_json = json.dumps(
        [{"id": s["scene_number"], "subtitles": [{"id": 1, "text": s["text"]}]} for s in scenes],
        ensure_ascii=False,
    )
    prompt = (
        "Please create an expressive image prompt for every scene by strictly adhering to the given rules."
        f"{registry}\n** Input Json **\n\n{scenes_json}"
    )
    resp = gemini._get_client().models.generate_content(
        model=config.GEMINI_MODEL,
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=instruction,
            response_mime_type="application/json",
            response_schema=_ScenePrompts,
            temperature=0.3,
        ),
    )
    data = _ScenePrompts.model_validate_json(resp.text)
    by_num = {p.scene_number: p for p in data.scenes}
    out = []
    for s in scenes:
        p = by_num.get(s["scene_number"])
        out.append(
            {
                "scene_number": s["scene_number"],
                "prompt": (p.prompt if p else ""),
                "character_names": (p.character_names if p else []),
            }
        )
    return out

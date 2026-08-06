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
# 캐릭터는 전 카테고리 허용(경제도 마스코트 가능). 등록된 캐릭터가 없으면 경제는 "사물만" 지침 유지.


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



def _gen_structured(contents, instruction: str, schema, temperature: float | None = None) -> str:
    """구조화(JSON) 생성 공통 헬퍼. Gemini 3.x는 생각 토큰이 출력 한도를 잠식해
    빈 text가 올 수 있어 max_output_tokens 상향 + 빈 응답 1회 재시도."""
    kwargs = dict(
        system_instruction=instruction,
        response_mime_type="application/json",
        response_schema=schema,
        max_output_tokens=65535,
    )
    if temperature is not None:
        kwargs["temperature"] = temperature
    cfg = types.GenerateContentConfig(**kwargs)
    last = "unknown"
    for _ in range(2):
        resp = gemini._get_client().models.generate_content(
            model=config.GEMINI_MODEL, contents=contents, config=cfg
        )
        if resp.text:
            return resp.text
        cand = (getattr(resp, "candidates", None) or [None])[0]
        last = f"empty text (finish_reason={getattr(cand, 'finish_reason', None)})"
        print(f"[longform] {last} → retry", flush=True)
    raise RuntimeError(f"gemini_structured_failed: {last}")

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
    data = _Parsed.model_validate_json(_gen_structured(prompt, instruction, _Parsed))
    # 개행·중복공백 정규화(자막에 개행이 흘러들면 CapCut 텍스트 하단 공백 발생)
    scenes = [[" ".join(s.text.split()) for s in sc.subtitles if s.text and s.text.strip()] for sc in data.scenes]
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
    instruction = _load("characters_extract.md")
    if archetype_names:
        instruction += (
            "\n\n# Archetype Rule\n"
            "For each character, additionally output an 'archetype' field:\n"
            f"- If the character is a GENERIC person/animal (not a specific named or historical figure), choose the closest archetype from this list: {', '.join(archetype_names)}\n"
            "- If the character is a specific/named/historical figure (e.g., 이순신), set archetype to null.\n"
            "- Archetype must be exactly one of the listed strings or null."
        )
    data = _Characters.model_validate_json(
        _gen_structured(f"script:\n{script_text}", instruction, _Characters)
    )
    return [c.model_dump() for c in data.characters]


# ---- 4) 장면별 이미지 프롬프트 (전체 맥락 1회 + 캐릭터 등장 비율 하드 캡) ----
class _ScenePrompt(BaseModel):
    scene_number: int
    prompt: str
    character_names: list[str] = []
    character_priority: int | None = None  # 1=스토리상 필수, 2=선택적(캡 초과 시 강등 대상)


class _ScenePrompts(BaseModel):
    scenes: list[_ScenePrompt]


# 캐릭터 등장 장면 비율 상한(코드 강제). 초과분은 사물-only 프롬프트로 재작성.
_CHAR_RATIO = float(os.environ.get("LONGFORM_CHAR_RATIO", "0.35"))

_NO_TEXT = "No text, no letters, no numbers, no writing anywhere."


def _sanitize(text: str) -> str:
    """이미지 모델이 글자를 못 그리므로 텍스트 유발 요소 강제 제거."""
    text = re.sub(r'["\'\u2018\u2019\u201c\u201d]', "", text)  # 모든 따옴표 제거
    text = re.sub(r"\S*[\uac00-\ud7a3\u3040-\u30ff\u4e00-\u9fff]+\S*", "", text)  # 한글/일어/한자 토큰 제거
    text = re.sub(r"\s+", " ", text).strip()
    if "no text" not in text.lower():
        text = f"{text} {_NO_TEXT}"
    return text


def _scenes_json(scenes: list[dict]) -> str:
    return json.dumps(
        [{"id": s["scene_number"], "subtitles": [{"id": 1, "text": s["text"]}]} for s in scenes],
        ensure_ascii=False,
    )


def image_prompts(
    category: str, language: str, characters: list[dict], scenes: list[dict]
) -> list[dict]:
    """scenes: [{scene_number, text}] → [{scene_number, prompt, character_names}]"""
    use_chars = bool(characters)  # 캐릭터가 등록돼 있으면 카테고리 무관 캐릭터 지침 사용
    instruction = _load("image_prompts_character.md" if use_chars else "image_prompts_economy.md")

    registry = ""
    cap = max(1, int(len(scenes) * _CHAR_RATIO))
    if use_chars:
        registry = "\n\n** Character Registry (use these exact descriptions verbatim) **\n" + "\n".join(
            f"- {c['name']}: {c['description']}" for c in characters
        )
        registry += (
            f"\n\nHARD CAP: At most {cap} of the {len(scenes)} scenes may contain any character."
            " Choose only the scenes where the character is story-critical."
            " For every scene that contains characters, also output character_priority:"
            " 1 if the character is essential to that moment of the story, 2 if optional."
        )
    prompt = (
        "Please create an expressive image prompt for every scene by strictly adhering to the given rules."
        f"{registry}\n** Input Json **\n\n{_scenes_json(scenes)}"
    )
    data = _ScenePrompts.model_validate_json(
        _gen_structured(prompt, instruction, _ScenePrompts, temperature=0.3)
    )

    # 비율 하드 캡 강제: 초과 시 우선순위 낮은 장면부터 강등 → 사물-only 프롬프트로 재작성
    if use_chars:
        withc = [sp for sp in data.scenes if sp.character_names]
        if len(withc) > cap:
            withc.sort(key=lambda sp: (sp.character_priority or 2, sp.scene_number))
            demote_nums = {sp.scene_number for sp in withc[cap:]}
            demote_scenes = [s for s in scenes if s["scene_number"] in demote_nums]
            print(f"[longform] char cap {cap}/{len(scenes)} 초과({len(withc)}) → {sorted(demote_nums)} 사물-only 재작성", flush=True)
            obj_instruction = _load("image_prompts_economy.md")  # 사람 금지·사물만 지침
            obj_prompt = (
                "Please create an expressive image prompt for every scene by strictly adhering to the given rules."
                f"\n** Input Json **\n\n{_scenes_json(demote_scenes)}"
            )
            obj = _ScenePrompts.model_validate_json(
                _gen_structured(obj_prompt, obj_instruction, _ScenePrompts, temperature=0.3)
            )
            obj_by = {sp.scene_number: sp for sp in obj.scenes}
            for sp in data.scenes:
                if sp.scene_number in demote_nums:
                    rep = obj_by.get(sp.scene_number)
                    if rep:
                        sp.prompt = rep.prompt
                    sp.character_names = []

    for sp in data.scenes:
        sp.prompt = _sanitize(sp.prompt)

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

"""Gemini: 장면분할 · 의미단위 분리 · 오디오 전사+번역.

google-genai SDK. JSON 강제는 response_mime_type + response_schema.
"""
import json
import os
import tempfile
import time

from google import genai
from google.genai import types

from app import config

_client: genai.Client | None = None


def _get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=config.GEMINI_API_KEY)
    return _client


_LANG_NAME = {"ko": "한국어", "ja": "일본어(Japanese)"}


def _generate_json(prompt: str, parts: list | None = None) -> dict:
    # response_schema(dict) 는 SDK 버전별 비호환 → mime_type + 프롬프트로 JSON 강제.
    contents: list = [prompt]
    if parts:
        contents.extend(parts)
    resp = _get_client().models.generate_content(
        model=config.GEMINI_MODEL,
        contents=contents,
        config=types.GenerateContentConfig(response_mime_type="application/json"),
    )
    text = (resp.text or "").strip()
    # 코드펜스 방어
    if text.startswith("```"):
        text = text.strip("`")
        text = text[text.find("{"):text.rfind("}") + 1] if "{" in text else text
    return json.loads(text)


# ---- 장면 분할 ----
def split_scenes(script_text: str, language: str) -> list[list[str]]:
    """대본 → [[장면1 줄들], [장면2 줄들], ...]. 합치면 원문과 100% 일치."""
    lang = _LANG_NAME.get(language, "한국어")
    prompt = (
        f"너는 영상 편집용 대본을 장면과 자막 줄로 나누는 도구다. 언어: {lang}.\n"
        "규칙:\n"
        "1) 의미 흐름에 따라 대본을 여러 '장면'으로 나눈다.\n"
        "2) 각 장면은 화면에 표시할 짧은 자막 '줄'들로 나눈다.\n"
        "3) 모든 장면의 모든 줄을 순서대로 이어붙이면 원문과 100% 일치해야 한다"
        "(글자·문장부호 누락/추가/수정 금지, 공백만 정리 가능).\n"
        "4) 새로운 내용을 창작하지 마라.\n\n"
        '출력은 JSON 객체. 형식: {"scenes": [{"lines": ["줄1", "줄2"]}, ...]}\n\n'
        f"대본:\n{script_text}"
    )
    data = _generate_json(prompt)
    scenes = []
    for sc in data.get("scenes", []):
        lines = [s for s in sc.get("lines", []) if s and s.strip()]
        if lines:
            scenes.append(lines)
    return scenes


# ---- 의미단위 분리 (자막2용) ----
_JSON_LINES_FORMAT = '출력은 JSON 객체. 형식: {"lines": ["줄1", "줄2", ...]}\n'


def semantic_split(text: str, language: str) -> list[str]:
    lang = _LANG_NAME.get(language, "한국어")
    prompt = (
        f"다음 텍스트를 자막용 의미 단위 줄로 나눠라. 출력 언어: {lang}.\n"
        "각 줄은 한 화면에 자연스럽게 들어갈 길이로. 내용 변경 금지.\n"
        f"{_JSON_LINES_FORMAT}\n"
        f"텍스트:\n{text}"
    )
    data = _generate_json(prompt)
    return [s for s in data.get("lines", []) if s and s.strip()]


# ---- 멀티모달 전사: 원본 영상 전체 + STT 발화 타임라인 → 구간별 정확한 자막 ----
def _mmss(us: int) -> str:
    s = us // 1_000_000
    return f"{s // 60}:{s % 60:02d}"


def _upload_video(video_bytes: bytes, mime_type: str = "video/mp4"):
    """Gemini Files API 업로드 후 ACTIVE 될 때까지 대기."""
    client = _get_client()
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tf:
        tf.write(video_bytes)
        path = tf.name
    try:
        file = client.files.upload(file=path)
    finally:
        os.remove(path)

    for _ in range(90):  # 최대 ~180s 대기
        state = getattr(file.state, "name", str(file.state))
        if state == "ACTIVE":
            return file
        if state == "FAILED":
            raise RuntimeError("gemini_video_upload_failed")
        time.sleep(2)
        file = client.files.get(name=file.name)
    raise RuntimeError("gemini_video_processing_timeout")


def correct_lines(video_bytes: bytes, lines: list[dict], language: str) -> list[dict]:
    """원본 영상(화면+소리) + STT로 미리 끊은 '자막 줄 목록' → 줄별 텍스트 교정(1:1).

    줄 경계와 시간은 STT가 이미 확정(여기서 바꾸지 않음). Gemini는 각 줄의 '텍스트만'
    화면 맥락까지 활용해 교정한다. 줄을 합치거나 더 쪼개지 않는다(입력 N줄 = 출력 N줄).

    lines: [{start_us, end_us, text(STT 자동전사)}]
    반환: 입력과 같은 길이의 list[{text, ko}]. (드롭된 줄은 STT 원문으로 폴백)
    """
    if not lines:
        return []
    lang = _LANG_NAME.get(language, "한국어")
    want_ko = language != "ko"
    listing = "\n".join(
        f"[{i}] {_mmss(l['start_us'])}~{_mmss(l['end_us'])}  자동전사: {l['text']}"
        for i, l in enumerate(lines)
    )
    ko_rule = (
        ' 그리고 각 줄의 한국어 번역을 "ko"에 넣는다(검증용).'
        if want_ko else ' "ko"는 비워도 된다.'
    )
    prompt = (
        "주어진 영상을 화면과 소리 모두로 분석한다.\n"
        "아래는 STT 자동전사로 '이미 시간과 줄 경계가 확정된' 자막 줄 목록이다"
        "(인덱스: 시작~끝 mm:ss, 자동전사 텍스트는 부정확할 수 있음).\n"
        f"{listing}\n\n"
        f"각 줄에 대해, 그 시간대에 실제로 들리는 말을 **화면 맥락(인물·사물·장소·화면 텍스트·상황)까지 "
        f"활용해 정확히 교정한 {lang} 자막 텍스트**를 출력하라.\n"
        "절대 규칙:\n"
        "- 줄의 **개수와 순서(인덱스)를 바꾸지 마라.** 줄을 합치거나 더 쪼개지 마라. 입력 1줄 = 출력 1줄.\n"
        "- 각 줄의 **시간은 고정**이다. 그 시간대에 실제로 들리는 말만 교정한다. 없는 말 창작 금지.\n"
        "- 잘못 들은 단어를 화면/문맥으로 바로잡되, 의역으로 풀어쓰지 말고 실제 발화에 충실히.\n"
        f"{ko_rule}\n"
        '출력 JSON: {"lines":[{"index":0,"text":"교정문","ko":"한국어"}, ...]}'
    )
    file = _upload_video(video_bytes)
    data = _generate_json(prompt, parts=[file])
    out = [{"text": l["text"], "ko": None} for l in lines]  # 폴백 = STT 원문
    for item in data.get("lines", []):
        i = item.get("index")
        if isinstance(i, int) and 0 <= i < len(lines):
            t = (item.get("text") or "").strip()
            k = (item.get("ko") or "").strip()
            out[i] = {"text": t or lines[i]["text"], "ko": (k or None) if want_ko else None}
    return out

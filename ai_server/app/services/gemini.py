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


def upload_video(video_bytes: bytes):
    """Gemini Files API 업로드(공개 API) — 교정·해설이 같은 업로드를 재사용."""
    return _upload_video(video_bytes)


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


def correct_lines(video_file, lines: list[dict], language: str) -> list[dict]:
    """원본 영상(업로드된 파일 핸들) + STT로 미리 끊은 '자막 줄 목록' → 줄별 텍스트 교정(1:1).

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
    data = _generate_json(prompt, parts=[video_file])
    out = [{"text": l["text"], "ko": None} for l in lines]  # 폴백 = STT 원문
    for item in data.get("lines", []):
        i = item.get("index")
        if isinstance(i, int) and 0 <= i < len(lines):
            t = (item.get("text") or "").strip()
            k = (item.get("ko") or "").strip()
            out[i] = {"text": t or lines[i]["text"], "ko": (k or None) if want_ko else None}
    return out


# ---- 해설 자막: 전체 맥락 기반, 샷별 배분(표시 전용) ----
_COMMENT_STYLES = {
    "docu": (
        "차분하고 신뢰감 있는 다큐멘터리 설명체. 존댓말('~합니다'). 감탄사·이모지 금지.",
        "경찰이 면허증을 요구하지만, 상황은 예상과 다르게 흘러갑니다.",
    ),
    "fun": (
        "유튜브 예능 자막톤. 반말+감탄+가벼운 과장, 'ㅋㅋ' 허용. 짧고 리드미컬하게.",
        "아니 ㅋㅋ 면허 달라니까 나이를 맞혀보라는데??",
    ),
    "story": (
        "긴장감 있는 스토리텔링체. 호흡을 끊고 반전을 강조. '그런데 그 순간—' 같은 연결.",
        "그런데 그 순간 — 시스템에 뜬 건 3년 전 사망 기록.",
    ),
    "reaction": (
        "시청자에게 말을 거는 리액션톤. '여러분', '보이시나요' 등 청자 지향.",
        "여러분 이거 보이시나요? 지금 그냥 도망갑니다.",
    ),
}


def generate_commentary(
    video_file, shots: list[tuple[int, int]], transcript: str,
    style: str, style_text: str | None, language: str,
) -> list[list[str]]:
    """원본 영상 전체 + 샷 타임라인 → 샷별 해설 자막(전체 맥락 기반 한 편의 대본).

    반환: shots와 같은 길이의 list[list[str]] (샷별 해설 줄들, 빈 배열 허용).
    """
    if not shots:
        return []
    lang = _LANG_NAME.get(language, "한국어")
    tone, example = _COMMENT_STYLES.get(style, _COMMENT_STYLES["docu"])
    if style == "custom" and style_text:
        tone, example = "아래 예시 문장들의 말투·어조·리듬을 최대한 모사하라.", style_text
    timeline = "\n".join(
        f"[{i}] {_mmss(s)}~{_mmss(e)} (길이 {round((e - s) / 1e6, 1)}초, 최대 {max(8, int((e - s) / 1e6 * 6))}자)"
        for i, (s, e) in enumerate(shots)
    )
    ctx = f"\n[원본 발화 전사(맥락 참고)]\n{transcript}\n" if transcript else ""
    prompt = (
        "주어진 영상을 화면과 소리 모두로 분석한다.\n"
        "먼저 영상 전체에서 무슨 일이 벌어지는지 파악하라(등장인물, 사건 흐름, 반전).\n"
        "그다음 전체를 관통하는 '한 편의 해설 대본'을 쓰되, 아래 샷 타임라인의 인덱스별로 배분하라.\n\n"
        f"[샷 타임라인]\n{timeline}\n{ctx}\n"
        f"[말투]\n{tone}\n예시: {example}\n\n"
        "규칙:\n"
        f"- 해설 언어: {lang}.\n"
        "- 각 샷의 해설은 표기된 '최대 글자수'를 절대 넘지 마라(1~2줄, 줄당 짧게). 못 지키면 그 샷은 비워라.\n"
        "- 길이 2초 미만인 샷은 원칙적으로 해설을 비워라(빈 배열) — 그 내용은 인접한 긴 샷에 합쳐라.\n"
        "- 첫 샷은 시선을 잡는 훅, 마지막 샷은 마무리 멘트.\n"
        "- '이 장면에서는' 같은 반복 금지. 앞 샷 내용을 이어받아 하나의 대본처럼 연결하라.\n"
        "- 화면/음성에 실제로 보이고 들리는 것만 말하라. 인물 이름은 전사에 나온 것만. 사실 추측 금지.\n"
        "- 원본 발화가 꽉 찬 샷은 해설을 비워도 된다(빈 배열).\n"
        '출력 JSON: {"shots":[{"index":0,"lines":["해설1","해설2"]}, ...]}'
    )
    data = _generate_json(prompt, parts=[video_file])
    out = [[] for _ in shots]
    for item in data.get("shots", []):
        i = item.get("index")
        if isinstance(i, int) and 0 <= i < len(shots):
            out[i] = [s.strip() for s in item.get("lines", []) if s and s.strip()]
    return out

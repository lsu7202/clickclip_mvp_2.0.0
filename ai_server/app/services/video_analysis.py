"""동영상 분석 오케스트레이션(AI 서버 내부).

설계(자막2 = 원본 소스 타임라인의 캡션 트랙):
  1. VI   → 샷 타임라인(미디어 컷 구조). 연속으로 정규화(틈 메움).
  2. STT  → 단어별 실제 타임스탬프.
  3. 분할 → STT 단어를 자연 경계(문장부호/쉼/길이)로 '줄'로 묶음.
            각 줄의 [start,end]는 그 줄 단어들의 '실제 STT 값'(추정 없음).
  4. 교정 → Gemini가 각 줄의 '텍스트만' 화면 맥락까지 활용해 1:1 교정(시간·줄경계 불변).
  반환: shots(컷 구조) + captions(원본 소스 시간 기준 자막2). 장면 배치는 백엔드/프론트가
        소스→출력 매핑으로 처리(자막2는 더 이상 장면에 묶이지 않음).
"""
import base64
import os
import subprocess
import tempfile

from app.services import gemini, stt, video_intel

_STT_WINDOW_US = 50_000_000  # STT 인라인 한도(60s) 안전 윈도우
_LINE_GAP_US = 500_000       # 이 이상 쉬면 줄 분리
_LINE_DUR_CAP = 6_000_000    # 한 줄 최대 길이(시간)
_LINE_CHAR_CAP = 42          # 한 줄 최대 길이(글자, 가독성)
_MIN_CAPTION_US = 1_200_000  # 자막2 최소 체류시간(읽기 가능). 다음 자막 침범 없이 침묵으로만 연장
_SENT_END = (".", "?", "!", "。", "？", "！", "…")


def _make_contiguous(shots: list[tuple[int, int]]) -> list[tuple[int, int]]:
    """샷을 연속으로(틈 메움): 각 샷 끝을 다음 샷 시작에 맞춰 원본을 빠짐없이 덮음.
    VI가 1프레임(~0.033s) 틈을 두고 샷을 반환 → 그 틈 프레임이 빠져 장면 사이 공백이
    생기는 것을 방지. 마지막 샷은 자체 끝 유지, 첫 샷은 0부터 시작하도록 보정."""
    if not shots:
        return []
    out = []
    n = len(shots)
    for i in range(n):
        s = 0 if i == 0 else out[i - 1][1]  # 직전 끝과 맞물림
        e = shots[i + 1][0] if i + 1 < n else shots[i][1]
        out.append((s, e))
    return out


def _window_shots(shots: list[tuple[int, int]]) -> list[tuple[int, int]]:
    """STT 60초 한도 회피: 연속 샷을 ≤50초 윈도우로 묶음(컷 경계에서만 자름).
    단일 샷이 50초를 넘으면 그 윈도우만 시간으로 추가 분할."""
    if not shots:
        return []
    windows = []
    w_start = shots[0][0]
    for i, (s, e) in enumerate(shots):
        if e - w_start > _STT_WINDOW_US and s > w_start:
            windows.append((w_start, shots[i - 1][1]))
            w_start = s
    windows.append((w_start, shots[-1][1]))
    final = []
    for a, b in windows:
        if b - a <= _STT_WINDOW_US:
            final.append((a, b))
        else:
            t = a
            while t < b:
                final.append((t, min(t + _STT_WINDOW_US, b)))
                t += _STT_WINDOW_US
    return final


def _extract_audio_range(vpath: str, start_us: int, end_us: int) -> str | None:
    """원본 영상 파일에서 [start,end] 구간 오디오 → mono 16k FLAC base64."""
    apath = f"{vpath}.{start_us}.flac"
    dur = max(0, end_us - start_us) / 1_000_000
    try:
        subprocess.run(
            ["ffmpeg", "-y", "-v", "error",
             "-ss", f"{start_us / 1_000_000:.3f}", "-i", vpath, "-t", f"{dur:.3f}",
             "-vn", "-ac", "1", "-ar", "16000", "-c:a", "flac", apath],
            check=True, capture_output=True,
        )
        if not os.path.isfile(apath) or os.path.getsize(apath) == 0:
            return None
        with open(apath, "rb") as f:
            return base64.b64encode(f.read()).decode()
    except subprocess.CalledProcessError:
        return None
    finally:
        if os.path.isfile(apath):
            os.remove(apath)


def _stt_words(video_bytes: bytes, shots: list[tuple[int, int]]) -> list[dict]:
    """STT 윈도우별 호출 → 단어 목록(절대 타임스탬프)으로 병합."""
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tf:
        tf.write(video_bytes)
        vpath = tf.name
    words = []
    try:
        for ws, we in _window_shots(shots):
            audio_b64 = _extract_audio_range(vpath, ws, we)
            if not audio_b64:
                continue
            for w in stt.transcribe_words(audio_b64)["words"]:
                words.append(
                    {"text": w["text"], "start_us": w["start_us"] + ws, "end_us": w["end_us"] + ws}
                )
    finally:
        if os.path.isfile(vpath):
            os.remove(vpath)
    words.sort(key=lambda w: w["start_us"])
    return words


def _split_into_lines(words: list[dict]) -> list[dict]:
    """STT 단어 → 읽기 좋은 '줄'. 문장부호/쉼/길이 기준으로 끊음.
    각 줄의 [start,end]는 그 줄 단어들의 실제 STT 값(추정 없음)."""
    lines = []
    start = 0
    n = len(words)
    for i in range(n):
        w = words[i]
        chunk = words[start:i + 1]
        text_len = sum(len(x["text"]) + 1 for x in chunk)
        dur = chunk[-1]["end_us"] - chunk[0]["start_us"]
        nxt = words[i + 1] if i + 1 < n else None
        gap = (nxt["start_us"] - w["end_us"]) if nxt else None
        brk = (
            nxt is None
            or w["text"].endswith(_SENT_END)
            or (gap is not None and gap > _LINE_GAP_US)
            or text_len >= _LINE_CHAR_CAP
            or dur >= _LINE_DUR_CAP
        )
        if brk:
            lines.append(
                {
                    "start_us": chunk[0]["start_us"],
                    "end_us": chunk[-1]["end_us"],
                    "text": " ".join(x["text"] for x in chunk).strip(),
                }
            )
            start = i + 1
    return lines


def process(video_base64: str, language: str) -> dict:
    video_bytes = base64.b64decode(video_base64)

    # 1) VI 샷 → 연속 정규화(미디어 컷 구조, 장면 사이 공백 제거)
    shots = _make_contiguous(video_intel.detect_shots(video_bytes))

    # 2) STT 단어(실제 타임스탬프) → 3) 줄로 분할(실제 STT 시간)
    words = _stt_words(video_bytes, shots)
    lines = _split_into_lines(words)

    # 4) Gemini 줄별 텍스트 교정(1:1, 시간·줄경계 불변)
    corrected = gemini.correct_lines(video_bytes, lines, language) if lines else []
    want_ko = language != "ko"
    captions = [
        {
            "start_us": ln["start_us"],
            "end_us": ln["end_us"],
            "text": corrected[i]["text"],
            "ko": corrected[i]["ko"] if want_ko else None,
        }
        for i, ln in enumerate(lines)
    ]

    # 겹침 제거(STT 윈도우 경계 아티팩트): 종료를 다음 시작으로 클램프
    captions.sort(key=lambda c: c["start_us"])
    for i in range(len(captions) - 1):
        if captions[i]["end_us"] > captions[i + 1]["start_us"]:
            captions[i]["end_us"] = captions[i + 1]["start_us"]
    captions = [c for c in captions if c["end_us"] > c["start_us"]]

    # 최소 체류시간 보정: STT 오인으로 너무 짧은 자막을 '뒤 침묵 구간으로만' 연장.
    # 바로 다음 자막이 이어지면(다음 시작까지) 늘릴 공간이 없어 그대로 → 짧아도 됨(다음 자막이 나와야 하니까).
    for i in range(len(captions)):
        nxt = captions[i + 1]["start_us"] if i + 1 < len(captions) else None
        desired = captions[i]["start_us"] + _MIN_CAPTION_US
        if captions[i]["end_us"] < desired:
            captions[i]["end_us"] = desired if nxt is None else min(desired, nxt)

    return {
        "shots": [{"start_us": s, "end_us": e} for s, e in shots],
        "captions": captions,
    }

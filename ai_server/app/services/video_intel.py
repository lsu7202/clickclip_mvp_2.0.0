"""Google Video Intelligence — 샷 경계 감지 전용(SHOT_CHANGE_DETECTION).

음성 전사는 VI가 ko/ja 미지원 → 사용 안 함(전사는 Gemini, services/gemini.py).
"""
from google.cloud import videointelligence as vi


def _offset_to_us(offset) -> int:
    # proto-plus 는 Duration 을 timedelta 로 노출. 구버전 호환 처리.
    if hasattr(offset, "total_seconds"):
        return int(round(offset.total_seconds() * 1_000_000))
    seconds = getattr(offset, "seconds", 0) or 0
    nanos = getattr(offset, "nanos", 0) or 0
    return int(seconds * 1_000_000 + nanos / 1000)


def detect_shots(video_bytes: bytes, timeout: int = 300) -> list[tuple[int, int]]:
    """동영상 바이트 → [(start_us, end_us), ...] 샷 구간 목록."""
    client = vi.VideoIntelligenceServiceClient()
    operation = client.annotate_video(
        request={
            "features": [vi.Feature.SHOT_CHANGE_DETECTION],
            "input_content": video_bytes,
        }
    )
    result = operation.result(timeout=timeout)
    annotations = result.annotation_results[0].shot_annotations
    shots = [
        (_offset_to_us(a.start_time_offset), _offset_to_us(a.end_time_offset))
        for a in annotations
    ]
    if not shots:
        # 샷 미검출 → 전체를 1개 샷으로(길이는 마지막 오프셋 없음 → 0..0 회피)
        shots = [(0, 0)]
    return shots

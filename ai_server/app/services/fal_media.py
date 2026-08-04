"""fal.ai AI 미디어 생성 (4모델 분기). §5.3 / §6.3.

분기: (media_type, reference 유무)
  image,  ref無 → FAL_MODEL_IMAGE_T2I (prompt, aspect_ratio)
  image,  ref有 → FAL_MODEL_IMAGE_REF (prompt, image_urls[], aspect_ratio)
  video,  ref無 → FAL_MODEL_VIDEO_T2V (prompt, aspect_ratio, resolution, duration)
  video,  ref有 → FAL_MODEL_VIDEO_I2V (prompt, image_url; aspect_ratio 없음 → 입력 비율 따름)

반환 dims는 신뢰하지 않음(특히 nano-banana=null). 백엔드가 ffprobe/측정으로 확정.
"""
import os

import fal_client

from app import config

def _video_duration_arg(model: str, want_s: int | None):
    """요청 길이(초)를 모델별 허용값으로 스냅. LTX=6~20 짝수 int, wan="5"|"10" 문자열."""
    want = want_s or config.FAL_VIDEO_DURATION
    if "ltx" in model:
        return min(20, max(6, round(want / 2) * 2))
    return "10" if want > 5 else "5"

# 모델별 크기 인자: flux-2(klein) 계열은 image_size{w,h}, flux-pro 계열은 aspect_ratio
_ASPECT_SIZES = {
    "16:9": {"width": 1280, "height": 720},
    "9:16": {"width": 720, "height": 1280},
    "1:1": {"width": 1024, "height": 1024},
}


def _size_args(model: str, aspect_ratio: str | None) -> dict:
    if not aspect_ratio:
        return {}
    if "flux-2" in model:
        return {"image_size": _ASPECT_SIZES.get(aspect_ratio, _ASPECT_SIZES["16:9"])}
    return {"aspect_ratio": aspect_ratio}


def _build_prompt(style_prompt: str | None, situation_text: str) -> str:
    if style_prompt:
        return f"{style_prompt}\n{situation_text}"
    return situation_text


def _reference_url(reference_name: str | None, reference_path: str | None = None) -> str:
    # reference_path: workspace 상대경로(캐릭터 레퍼런스/장면 이미지 i2v) 우선
    if reference_path:
        path = os.path.join("/workspace", reference_path.lstrip("/"))
    else:
        path = os.path.join(config.MY_SAMPLES_DIR, reference_name)
    return fal_client.upload_file(path)


def generate(
    media_type: str,
    style_prompt: str | None,
    situation_text: str,
    reference_name: str | None,
    aspect_ratio: str | None,
    reference_path: str | None = None,
    duration_s: int | None = None,
) -> dict:
    os.environ["FAL_KEY"] = config.FAL_KEY  # fal_client 는 env 에서 읽음
    prompt = _build_prompt(style_prompt, situation_text)
    has_ref = bool(reference_name or reference_path)

    if media_type == "image":
        if has_ref:
            model = config.FAL_MODEL_IMAGE_REF
            args = {"prompt": prompt, "image_urls": [_reference_url(reference_name, reference_path)]}
            args.update(_size_args(model, aspect_ratio))
        else:
            model = config.FAL_MODEL_IMAGE_T2I
            args = {"prompt": prompt}
            args.update(_size_args(model, aspect_ratio))
        result = fal_client.run(model, arguments=args)
        img = (result.get("images") or [{}])[0]
        return {
            "media_url": img.get("url", ""),
            "source_type": "ai_image",
            "width_px": img.get("width") or 0,
            "height_px": img.get("height") or 0,
            "duration_us": None,
            "has_audio": False,
        }

    # video
    if has_ref:
        model = config.FAL_MODEL_VIDEO_I2V
        args = {
            "prompt": prompt,
            "image_url": _reference_url(reference_name, reference_path),
            "resolution": config.FAL_VIDEO_RESOLUTION,
            "duration": _video_duration_arg(model, duration_s),
        }
        # I2V: aspect_ratio 없음(입력 이미지 비율을 따름)
    else:
        model = config.FAL_MODEL_VIDEO_T2V
        args = {
            "prompt": prompt,
            "resolution": config.FAL_VIDEO_RESOLUTION,
            "duration": _video_duration_arg(model, duration_s),
        }
        if aspect_ratio:
            args["aspect_ratio"] = aspect_ratio

    result = fal_client.run(model, arguments=args)
    video = result.get("video") or {}
    return {
        "media_url": video.get("url", ""),
        "source_type": "ai_video",
        "width_px": video.get("width") or 0,
        "height_px": video.get("height") or 0,
        "duration_us": None,
        "has_audio": True,
    }

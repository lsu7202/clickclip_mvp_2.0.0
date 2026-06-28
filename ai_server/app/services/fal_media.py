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

_VIDEO_RESOLUTION = "1080p"
_VIDEO_DURATION = "5"


def _build_prompt(style_prompt: str | None, situation_text: str) -> str:
    if style_prompt:
        return f"{style_prompt}\n{situation_text}"
    return situation_text


def _reference_url(reference_name: str) -> str:
    path = os.path.join(config.MY_SAMPLES_DIR, reference_name)
    return fal_client.upload_file(path)


def generate(
    media_type: str,
    style_prompt: str | None,
    situation_text: str,
    reference_name: str | None,
    aspect_ratio: str | None,
) -> dict:
    os.environ["FAL_KEY"] = config.FAL_KEY  # fal_client 는 env 에서 읽음
    prompt = _build_prompt(style_prompt, situation_text)
    has_ref = bool(reference_name)

    if media_type == "image":
        if has_ref:
            model = config.FAL_MODEL_IMAGE_REF
            args = {"prompt": prompt, "image_urls": [_reference_url(reference_name)]}
            if aspect_ratio:
                args["aspect_ratio"] = aspect_ratio
        else:
            model = config.FAL_MODEL_IMAGE_T2I
            args = {"prompt": prompt}
            if aspect_ratio:
                args["aspect_ratio"] = aspect_ratio
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
            "image_url": _reference_url(reference_name),
            "resolution": _VIDEO_RESOLUTION,
            "duration": _VIDEO_DURATION,
        }
        # I2V: aspect_ratio 없음(입력 이미지 비율을 따름)
    else:
        model = config.FAL_MODEL_VIDEO_T2V
        args = {
            "prompt": prompt,
            "resolution": _VIDEO_RESOLUTION,
            "duration": _VIDEO_DURATION,
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

"""스타일 프리셋: <style_id>.txt 의 기반 프롬프트 로딩(서버 보관, 프론트 비노출)."""
import os

from app import config


def load_style_prompt(style_id: str | None) -> str | None:
    if not style_id:
        return None
    path = os.path.join(config.MY_STYLES_DIR, f"{style_id}.txt")
    if not os.path.isfile(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        text = f.read().strip()
    return text or None

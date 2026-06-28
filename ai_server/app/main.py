"""ClickClip AI 서버 (FastAPI, snake_case). 백엔드만 호출(내부)."""
from fastapi import FastAPI

from app.routers import ai_media, scenes, translate, tts, video_analysis

app = FastAPI(title="ClickClip AI Server", version="2.0.0")

app.include_router(scenes.router)
app.include_router(tts.router)
app.include_router(ai_media.router)
app.include_router(translate.router)
app.include_router(video_analysis.router)


@app.get("/health")
def health():
    return {"status": "ok", "service": "ai_server"}

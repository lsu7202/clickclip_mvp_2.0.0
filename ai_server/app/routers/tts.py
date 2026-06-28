from fastapi import APIRouter

from app.schemas import CharTiming, TtsReq, TtsResp
from app.services import typecast

router = APIRouter(tags=["tts"])


@router.post("/tts", response_model=TtsResp)
def tts(req: TtsReq) -> TtsResp:
    result = typecast.synthesize(req.tts_text, req.voice_id, req.language)
    return TtsResp(
        audio_base64=result["audio_base64"],
        audio_format=result["audio_format"],
        duration_us=result["duration_us"],
        char_timings=[CharTiming(**c) for c in result["char_timings"]],
    )

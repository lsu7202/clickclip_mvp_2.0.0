from fastapi import APIRouter, HTTPException

from app.schemas import CharTiming, TtsReq, TtsResp
from app.services import typecast

router = APIRouter(tags=["tts"])


@router.post("/tts", response_model=TtsResp)
def tts(req: TtsReq) -> TtsResp:
    try:
        result = typecast.synthesize(req.tts_text, req.voice_id, req.language, req.speed)
    except RuntimeError as e:
        msg = str(e)
        # 크레딧 소진/계정 비활성은 재시도해도 소용없음 → 402로 구분(백엔드가 즉시 중단 안내)
        if "CREDIT_INSUFFICIENT" in msg or "typecast_402" in msg:
            raise HTTPException(status_code=402, detail="tts_credit_insufficient") from e
        raise HTTPException(status_code=502, detail=msg[:300]) from e
    return TtsResp(
        audio_base64=result["audio_base64"],
        audio_format=result["audio_format"],
        duration_us=result["duration_us"],
        char_timings=[CharTiming(**c) for c in result["char_timings"]],
    )

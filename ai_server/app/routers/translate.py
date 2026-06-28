from fastapi import APIRouter

from app.schemas import TranslateReq, TranslateResp
from app.services import translate as translate_service

router = APIRouter(tags=["translate"])


@router.post("/translate", response_model=TranslateResp)
def translate(req: TranslateReq) -> TranslateResp:
    translations = translate_service.translate(req.texts, req.target)
    return TranslateResp(translations=translations)

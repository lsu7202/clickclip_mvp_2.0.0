from fastapi import APIRouter

from app.schemas import AiMediaReq, AiMediaResp
from app.services import fal_media, styles

router = APIRouter(tags=["ai_media"])


@router.post("/ai-media/generate", response_model=AiMediaResp)
def ai_media_generate(req: AiMediaReq) -> AiMediaResp:
    style_prompt = styles.load_style_prompt(req.style_id)
    result = fal_media.generate(
        media_type=req.media_type,
        style_prompt=style_prompt,
        situation_text=req.situation_text,
        reference_name=req.reference_name,
        aspect_ratio=req.aspect_ratio,
    )
    return AiMediaResp(**result)

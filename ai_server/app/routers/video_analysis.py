from fastapi import APIRouter

from app.schemas import Caption, Shot, VideoAnalysisReq, VideoAnalysisResp
from app.services import video_analysis

router = APIRouter(tags=["video_analysis"])


@router.post("/video-analysis/process", response_model=VideoAnalysisResp)
def process(req: VideoAnalysisReq) -> VideoAnalysisResp:
    out = video_analysis.process(
        req.video_base64,
        req.language,
        want_captions=req.want_captions,
        want_commentary=req.want_commentary,
        commentary_style=req.commentary_style,
        commentary_style_text=req.commentary_style_text,
    )
    return VideoAnalysisResp(
        shots=[Shot(**s) for s in out["shots"]],
        captions=[Caption(**c) for c in out["captions"]],
        commentary=out["commentary"],
    )

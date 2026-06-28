from fastapi import APIRouter

from app.schemas import Caption, Shot, VideoAnalysisReq, VideoAnalysisResp
from app.services import video_analysis

router = APIRouter(tags=["video_analysis"])


@router.post("/video-analysis/process", response_model=VideoAnalysisResp)
def process(req: VideoAnalysisReq) -> VideoAnalysisResp:
    out = video_analysis.process(req.video_base64, req.language)
    return VideoAnalysisResp(
        shots=[Shot(**s) for s in out["shots"]],
        captions=[Caption(**c) for c in out["captions"]],
    )

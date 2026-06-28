from fastapi import APIRouter

from app.schemas import (
    SceneSplitReq,
    SceneSplitResp,
    SemanticSplitReq,
    SemanticSplitResp,
    SplitLine,
    SplitScene,
    SemanticLine,
)
from app.services import gemini

router = APIRouter(tags=["scenes"])


@router.post("/scenes/split", response_model=SceneSplitResp)
def scenes_split(req: SceneSplitReq) -> SceneSplitResp:
    scene_groups = gemini.split_scenes(req.script_text, req.language)
    scenes = [
        SplitScene(
            scene_number=i + 1,
            subtitle1_lines=[
                SplitLine(line_number=j + 1, text=t) for j, t in enumerate(lines)
            ],
        )
        for i, lines in enumerate(scene_groups)
    ]
    return SceneSplitResp(scenes=scenes)


@router.post("/scenes/semantic-split", response_model=SemanticSplitResp)
def semantic_split(req: SemanticSplitReq) -> SemanticSplitResp:
    lines = gemini.semantic_split(req.text, req.language)
    return SemanticSplitResp(lines=[SemanticLine(text=t) for t in lines])

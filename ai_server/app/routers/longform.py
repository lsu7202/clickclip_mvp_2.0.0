from fastapi import APIRouter

from app.schemas import (
    CharacterExtractReq,
    CharacterExtractResp,
    CharacterSheet,
    ImagePromptsReq,
    ImagePromptsResp,
    LongformSplitReq,
    SceneSplitResp,
    ScenePromptOut,
    ScriptGenReq,
    ScriptGenResp,
    SplitLine,
    SplitScene,
)
from app.services import longform

router = APIRouter(tags=["longform"])


@router.post("/script/generate", response_model=ScriptGenResp)
def script_generate(req: ScriptGenReq) -> ScriptGenResp:
    script = longform.generate_script(req.category, req.topic, req.description, req.language, req.target_chars)
    return ScriptGenResp(script=script)


@router.post("/scenes/split-longform", response_model=SceneSplitResp)
def split_longform(req: LongformSplitReq) -> SceneSplitResp:
    scene_groups = longform.split_longform(req.script_text, req.language)
    scenes = [
        SplitScene(
            scene_number=i + 1,
            subtitle1_lines=[SplitLine(line_number=j + 1, text=t) for j, t in enumerate(lines)],
        )
        for i, lines in enumerate(scene_groups)
    ]
    return SceneSplitResp(scenes=scenes)


@router.post("/longform/characters", response_model=CharacterExtractResp)
def characters(req: CharacterExtractReq) -> CharacterExtractResp:
    chars = longform.extract_characters(req.script_text, req.category, req.language, req.archetype_names)
    return CharacterExtractResp(characters=[CharacterSheet(**c) for c in chars])


@router.post("/longform/image-prompts", response_model=ImagePromptsResp)
def image_prompts(req: ImagePromptsReq) -> ImagePromptsResp:
    out = longform.image_prompts(
        req.category, req.language, [c.model_dump() for c in req.characters],
        [s.model_dump() for s in req.scenes],
    )
    return ImagePromptsResp(scenes=[ScenePromptOut(**o) for o in out])

import { Router } from "express";

import { aiPost } from "../lib/aiClient.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { hydrateSplitScene } from "../lib/hydrate.js";

const router = Router();

// POST /scenes/split — 대본 → 장면+자막1(완전체 하이드레이트)
router.post(
  "/scenes/split",
  asyncHandler(async (req, res) => {
    const { scriptText, language } = req.body;
    const ai = await aiPost("/scenes/split", { scriptText, language });
    const scenes = (ai.scenes || []).map(hydrateSplitScene);
    res.json({ scenes });
  })
);

// ---- 롱폼(yt-ai-platform 이식) ----

// POST /script/generate — 카테고리별 AI 대본 생성(검색 그라운딩)
router.post(
  "/script/generate",
  asyncHandler(async (req, res) => {
    const { category, topic, description, language, targetChars } = req.body;
    const ai = await aiPost("/script/generate", { category, topic, description, language, targetChars: targetChars ?? null });
    res.json({ script: ai.script });
  })
);

// POST /scenes/split-longform — 1문장=1장면 + 호흡단위 자막(원문 100%)
router.post(
  "/scenes/split-longform",
  asyncHandler(async (req, res) => {
    const { scriptText, language } = req.body;
    const ai = await aiPost("/scenes/split-longform", { scriptText, language });
    const scenes = (ai.scenes || []).map(hydrateSplitScene);
    res.json({ scenes });
  })
);

// POST /longform/characters — 등장인물 시트 추출(동일 인물 일관성)
router.post(
  "/longform/characters",
  asyncHandler(async (req, res) => {
    const { scriptText, category, language, archetypeNames } = req.body;
    const ai = await aiPost("/longform/characters", { scriptText, category, language, archetypeNames: archetypeNames || [] });
    res.json({ characters: ai.characters || [] });
  })
);

// POST /longform/image-prompts — 장면별 이미지 프롬프트 일괄 생성(전체 맥락)
router.post(
  "/longform/image-prompts",
  asyncHandler(async (req, res) => {
    const { category, language, characters, scenes } = req.body;
    const ai = await aiPost("/longform/image-prompts", { category, language, characters, scenes });
    res.json({ scenes: ai.scenes || [] });
  })
);

export default router;

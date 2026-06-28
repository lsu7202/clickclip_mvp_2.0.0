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

export default router;

import { Router } from "express";

import { aiPost } from "../lib/aiClient.js";
import { asyncHandler } from "../lib/asyncHandler.js";

const router = Router();

// POST /translate — 자막 이해 보조용 배치 번역(Cloud Translation). export 무관.
router.post(
  "/translate",
  asyncHandler(async (req, res) => {
    const { texts, target } = req.body;
    const ai = await aiPost("/translate", { texts, target });
    res.json({ translations: ai.translations || [] });
  })
);

export default router;

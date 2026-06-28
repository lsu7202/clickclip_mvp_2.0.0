import { Router } from "express";
import { v4 as uuid } from "uuid";

import { aiPost } from "../lib/aiClient.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { probe } from "../lib/media.js";
import { absPath, downloadTo, extFromUrl } from "../lib/workspace.js";

const router = Router();

// POST /ai-media/generate — AI 서버가 fal 호출→URL, 백엔드가 받아 저장·측정→Asset
router.post(
  "/ai-media/generate",
  asyncHandler(async (req, res) => {
    const { mediaType, styleId, situationText, referenceName, aspectRatio } = req.body;
    const ai = await aiPost("/ai-media/generate", {
      mediaType,
      styleId: styleId ?? null,
      situationText,
      referenceName: referenceName ?? null,
      aspectRatio: aspectRatio ?? null,
    });

    const isVideo = ai.sourceType === "ai_video";
    const ext = extFromUrl(ai.mediaUrl, isVideo ? ".mp4" : ".png");
    const relPath = `ai/${uuid()}${ext}`;
    await downloadTo(relPath, ai.mediaUrl);

    const measured = await probe(absPath(relPath));
    res.json({
      sourceType: ai.sourceType,
      localPath: relPath,
      capcutPath: "",
      widthPx: measured.widthPx || ai.widthPx || 0,
      heightPx: measured.heightPx || ai.heightPx || 0,
      durationUs: isVideo ? measured.durationUs : null,
      hasAudio: isVideo ? measured.hasAudio : false,
    });
  })
);

export default router;

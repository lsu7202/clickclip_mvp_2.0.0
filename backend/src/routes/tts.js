import { Router } from "express";

import { config } from "../config.js";
import { aiPost } from "../lib/aiClient.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { trimLeadTrailSilence } from "../lib/media.js";
import { absPath, saveBase64 } from "../lib/workspace.js";

const router = Router();

// POST /tts — 자막1 줄 1개 TTS. base64 디코드 → workspace 저장 → (옵션)무음 트림 → TtsResult.
// 파일명: tts/<sceneNumber>-<lineNumber>.<ext> (프론트가 번호 동봉)
router.post(
  "/tts",
  asyncHandler(async (req, res) => {
    const { ttsText, voiceId, language, sceneNumber, lineNumber, trimSilence } = req.body;
    const ai = await aiPost("/tts", { ttsText, voiceId, language });

    const ext = ai.audioFormat || "mp3";
    const relPath = `tts/${sceneNumber ?? "x"}-${lineNumber ?? Date.now()}.${ext}`;
    await saveBase64(relPath, ai.audioBase64);

    // (A) 앞뒤 무음 제거 → 길이 단축이 그대로 장면 타이밍에 반영됨
    let durationUs = ai.durationUs;
    const doTrim = trimSilence ?? config.ttsTrimSilence;
    if (doTrim) {
      const trimmed = await trimLeadTrailSilence(absPath(relPath), config.ttsSilenceThresholdDb);
      if (trimmed) durationUs = trimmed;
    }

    res.json({
      localPath: relPath,
      durationUs,
      charTimings: ai.charTimings || [],
    });
  })
);

export default router;

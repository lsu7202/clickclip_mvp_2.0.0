import fs from "node:fs/promises";

import { Router } from "express";
import { v4 as uuid } from "uuid";

import { config } from "../config.js";
import { aiPost } from "../lib/aiClient.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { probeDurationUs, trimAudioRange } from "../lib/media.js";
import { absPath, saveBase64 } from "../lib/workspace.js";

const router = Router();
const nonSpaceLen = (s) => (s || "").replace(/\s/g, "").length;

// POST /tts — 장면 단위 TTS.
// 자막1 줄들을 띄어쓰기로 이어 1회 합성(자연스러운 발화) → char 타이밍으로 줄별 시간 복원 →
// 발화 구간으로 정확히 트림(앞뒤 무음 제거, 줄 시간 자동 정렬).
// 반환: { localPath, durationUs, lineRanges:[{lineNumber,startUs,endUs}] }
router.post(
  "/tts",
  asyncHandler(async (req, res) => {
    const { lines = [], voiceId, language, sceneNumber } = req.body;
    const joined = lines.map((l) => l.ttsText || "").join(" ").trim();
    if (!joined) {
      res.json({ localPath: null, durationUs: 0, lineRanges: [] });
      return;
    }

    const ai = await aiPost("/tts", { ttsText: joined, voiceId, language });
    const ext = ai.audioFormat || "wav";
    const relPath = `tts/scene-${sceneNumber ?? "x"}-${uuid()}.${ext}`;
    await saveBase64(relPath, ai.audioBase64);

    // char 타이밍(공백 제외)을 줄별 글자수만큼 소비 → 줄별 [start,end] (오디오 내 오프셋)
    const tc = (ai.charTimings || []).filter((c) => (c.char || "").trim() !== "");
    const total = tc.length;
    let i = 0;
    const lineRanges = lines.map((l) => {
      const n = nonSpaceLen(l.ttsText);
      if (n === 0 || i >= total) return { lineNumber: l.lineNumber, startUs: null, endUs: null };
      const j = Math.min(i + n, total) - 1;
      const r = { lineNumber: l.lineNumber, startUs: tc[i].startUs, endUs: tc[j].endUs };
      i = j + 1;
      return r;
    });

    // 트림: 발화 구간 [첫 글자 시작, 마지막 글자 끝]로 atrim → 줄 시간 -firstStart 오프셋
    let durationUs = ai.durationUs;
    if (config.ttsTrimSilence && total > 0 && tc[total - 1].endUs > tc[0].startUs) {
      const firstStart = tc[0].startUs;
      const lastEnd = tc[total - 1].endUs;
      const tmpRel = `tts/scene-${sceneNumber ?? "x"}-${uuid()}.t.${ext}`;
      try {
        await trimAudioRange(absPath(relPath), firstStart, lastEnd, absPath(tmpRel));
        const d = await probeDurationUs(absPath(tmpRel));
        if (d && d > 0) {
          await fs.rename(absPath(tmpRel), absPath(relPath));
          durationUs = d;
          for (const r of lineRanges) {
            if (r.startUs != null) {
              r.startUs = Math.max(0, r.startUs - firstStart);
              r.endUs = Math.max(0, r.endUs - firstStart);
            }
          }
        } else {
          await fs.unlink(absPath(tmpRel)).catch(() => {});
        }
      } catch {
        await fs.unlink(absPath(tmpRel)).catch(() => {});
      }
    }

    res.json({ localPath: relPath, durationUs, lineRanges });
  })
);

export default router;

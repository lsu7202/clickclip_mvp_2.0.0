import fs from "node:fs/promises";

import { Router } from "express";
import multer from "multer";
import { v4 as uuid } from "uuid";

import { aiPost } from "../lib/aiClient.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { createJob, getJob, updateJob } from "../lib/jobs.js";
import { probe, sliceVideo } from "../lib/media.js";
import { defaultVoiceId } from "../lib/hydrate.js";
import { absPath, saveBuffer } from "../lib/workspace.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 1024 * 1024 * 1024 } });

// 백그라운드 처리(§5.6): AI 샷 분석 → ffmpeg 슬라이스 → Scene[] + 캡션 트랙 조립
// 원본 자막(구 자막2)은 '원본 소스 타임라인 캡션', 해설 자막은 장면 소유(표시 전용).
async function runAnalysis(jobId, srcRelPath, language, targetSceneNumber, opts) {
  try {
    updateJob(jobId, { status: "running" });
    const videoBuf = await fs.readFile(absPath(srcRelPath));
    const ai = await aiPost("/video-analysis/process", {
      videoBase64: videoBuf.toString("base64"),
      language,
      wantCaptions: opts.wantCaptions,
      wantCommentary: opts.wantCommentary,
      commentaryStyle: opts.commentaryStyle,
      commentaryStyleText: opts.commentaryStyleText || null,
    });

    const sourceId = uuid(); // 이 원본 영상(분석본) 식별자 — 장면 미디어/캡션이 공유
    const scenes = [];
    const shots = ai.shots || [];
    for (let i = 0; i < shots.length; i++) {
      const shot = shots[i];
      const clipRel = `videos/${uuid()}.mp4`;
      await sliceVideo(absPath(srcRelPath), absPath(clipRel), shot.startUs, shot.endUs);
      const m = await probe(absPath(clipRel));
      const media = {
        sourceType: "video_shot",
        localPath: clipRel,
        capcutPath: "",
        widthPx: m.widthPx,
        heightPx: m.heightPx,
        durationUs: m.durationUs ?? Math.max(0, shot.endUs - shot.startUs),
        hasAudio: m.hasAudio,
        fps: m.fps ?? null,
        // 원본 소스 앵커: 이 클립이 원본 영상의 [origStartUs, origEndUs] 구간임
        origSourceId: sourceId,
        origStartUs: shot.startUs,
        origEndUs: shot.endUs,
      };
      // 해설 자막(장면 소유, 표시 전용): 샷별 줄들을 장면 길이에 균등 분배
      const comLines = (ai.commentary?.[i] || []).filter((t) => t && t.trim());
      const dur = media.durationUs || 0;
      const commentaryLines = comLines.map((text, j) => ({
        lineNumber: j + 1,
        text,
        startUs: Math.round((j * dur) / comLines.length),
        endUs: Math.round(((j + 1) * dur) / comLines.length),
      }));

      scenes.push({
        sceneNumber: targetSceneNumber + i, // 프론트 삽입 시 재번호(§3 g)
        media,
        voiceId: defaultVoiceId(),
        muted: false,
        fitToTts: false,
        subtitle1Lines: [],
        commentaryLines,
        durationUs: media.durationUs,
      });
    }

    // 원본 자막 = 원본 소스 시간 기준 캡션(장면에 묶지 않음)
    const captions = (ai.captions || []).map((c) => ({
      id: uuid(),
      sourceId,
      startUs: c.startUs,
      endUs: c.endUs,
      text: c.text,
      ko: c.ko ?? null,
    }));

    updateJob(jobId, {
      status: "done",
      result: { targetSceneNumber, scenes, captions },
    });
  } catch (err) {
    console.error("[video-analysis] failed:", err?.message || err);
    updateJob(jobId, { status: "error", error: err?.message || "analysis_failed" });
  }
}

// POST /video-analysis (multipart) → job_id 즉시 반환
// multipart 라 caseConvert 미적용 → 필드명 snake 그대로 수신
router.post(
  "/video-analysis",
  upload.single("video"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "video_required" });
      return;
    }
    const language = req.body.language || "ko";
    const targetSceneNumber = parseInt(req.body.target_scene_number, 10) || 1;
    const opts = {
      wantCaptions: String(req.body.want_captions ?? "true") !== "false",
      wantCommentary: String(req.body.want_commentary ?? "false") === "true",
      commentaryStyle: req.body.commentary_style || "docu",
      commentaryStyleText: req.body.commentary_style_text || null,
    };

    const srcRel = `videos/src-${uuid()}.mp4`;
    await saveBuffer(srcRel, req.file.buffer);

    const job = createJob("video_analysis");
    // 비동기 백그라운드 실행(await 안 함)
    runAnalysis(job.jobId, srcRel, language, targetSceneNumber, opts);

    res.json({ jobId: job.jobId });
  })
);

// GET /jobs/:jobId — 폴링
router.get(
  "/jobs/:jobId",
  asyncHandler(async (req, res) => {
    const job = getJob(req.params.jobId);
    if (!job) {
      res.status(404).json({ error: "job_not_found" });
      return;
    }
    res.json({
      jobId: job.jobId,
      type: job.type,
      status: job.status,
      result: job.result,
    });
  })
);

export default router;

import fs from "node:fs/promises";
import path from "node:path";

import { Router } from "express";
import multer from "multer";
import { v4 as uuid } from "uuid";

import { config } from "../config.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { extractFrame, probe, probeDurationUs } from "../lib/media.js";
import { absPath, downloadTo, extFromUrl, saveBuffer } from "../lib/workspace.js";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 500 * 1024 * 1024 } });

async function buildAsset(relPath, sourceType, forceImage = false) {
  const m = await probe(absPath(relPath));
  const isVideo = !forceImage && m.durationUs != null;
  return {
    sourceType,
    localPath: relPath,
    capcutPath: "",
    widthPx: m.widthPx,
    heightPx: m.heightPx,
    durationUs: isVideo ? m.durationUs : null,
    hasAudio: isVideo ? m.hasAudio : false,
    fps: isVideo ? m.fps ?? null : null,
  };
}

// POST /assets/download — gif/이미지 URL 저장 → Asset
router.post(
  "/assets/download",
  asyncHandler(async (req, res) => {
    const { url } = req.body;
    const ext = extFromUrl(url, ".jpg");
    const relPath = `downloads/${uuid()}${ext}`;
    await downloadTo(relPath, url);
    const sourceType = ext.toLowerCase() === ".gif" ? "gif" : "image";
    res.json(await buildAsset(relPath, sourceType, sourceType !== "video"));
  })
);

// POST /assets/upload — 이미지/동영상 업로드(multipart) → Asset
router.post(
  "/assets/upload",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "file_required" });
      return;
    }
    const original = req.file.originalname || "upload";
    const dot = original.lastIndexOf(".");
    const ext = dot >= 0 ? original.slice(dot) : "";
    const relPath = `uploads/${uuid()}${ext}`;
    await saveBuffer(relPath, req.file.buffer);
    res.json(await buildAsset(relPath, "upload"));
  })
);

// POST /sound-effects/use — 라이브러리(my_sound_effect) 효과음을 workspace로 복사 → { localPath, durationUs }
// 리소스 폴더는 export 시 collectAssets가 못 읽으므로 workspace로 복사해 사용.
router.post(
  "/sound-effects/use",
  asyncHandler(async (req, res) => {
    const safe = path.basename(req.body.name || ""); // 경로 탈출 방지
    if (!safe) {
      res.status(400).json({ error: "name_required" });
      return;
    }
    const srcAbs = path.join(config.mySoundEffectsDir, safe);
    const ext = path.extname(safe) || ".mp3";
    const relPath = `sfx/${uuid()}${ext}`;
    let buf;
    try {
      buf = await fs.readFile(srcAbs);
    } catch {
      res.status(404).json({ error: "sound_effect_not_found" });
      return;
    }
    await saveBuffer(relPath, buf);
    res.json({ localPath: relPath, durationUs: await probeDurationUs(absPath(relPath)) });
  })
);

// POST /assets/extract-frame — 동영상 한 프레임을 PNG로 추출 → 프리즈 장면용 이미지 Asset
router.post(
  "/assets/extract-frame",
  asyncHandler(async (req, res) => {
    const { localPath, atUs } = req.body;
    if (!localPath) {
      res.status(400).json({ error: "localPath_required" });
      return;
    }
    const relPath = `videos/freeze-${uuid()}.png`;
    await extractFrame(absPath(localPath), atUs || 0, absPath(relPath));
    res.json(await buildAsset(relPath, "image", true));
  })
);

export default router;

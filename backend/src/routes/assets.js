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

// ---- 스톡 캐릭터 라이브러리 (resources/my_characters/<style>/<archetype>.png) ----
// 스타일별 아키타입 레퍼런스를 1회 생성 후 캐싱 → 전 영상 재사용(채널 고정 출연진)
const STOCK_DIR = process.env.MY_CHARACTERS_DIR || "/resources/my_characters";
const stockPath = (style, archetype) =>
  path.join(STOCK_DIR, path.basename(style), `${path.basename(archetype)}.png`);

// GET /characters-stock/custom — 사용자 커스텀 인물 폴더(my_characters/custom/*.png|jpg) 목록
router.get(
  "/characters-stock/custom",
  asyncHandler(async (req, res) => {
    let files = [];
    try {
      files = (await fs.readdir(path.join(STOCK_DIR, "custom")))
        .filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
    } catch { /* 폴더 없음 → 빈 목록 */ }
    res.json({ items: files.map((f) => ({ name: path.basename(f, path.extname(f)), file: f })) });
  })
);

// POST /characters-stock/use — 라이브러리에 있으면 workspace로 복사해 반환, 없으면 404
router.post(
  "/characters-stock/use",
  asyncHandler(async (req, res) => {
    const { style, archetype } = req.body;
    const dir = path.join(STOCK_DIR, path.basename(style || ""));
    const base = path.basename(archetype || "");
    // .png 우선, 없으면 같은 이름의 다른 확장자(jpg 등) 탐색 — custom 폴더 대응
    let src = path.join(dir, `${base}.png`);
    let buf;
    try {
      buf = await fs.readFile(src);
    } catch {
      try {
        const hit = (await fs.readdir(dir)).find(
          (f) => path.basename(f, path.extname(f)) === base && /\.(png|jpe?g|webp)$/i.test(f)
        );
        if (!hit) throw new Error("none");
        src = path.join(dir, hit);
        buf = await fs.readFile(src);
      } catch {
        res.status(404).json({ error: "stock_not_found" });
        return;
      }
    }
    const relPath = `characters/${uuid()}${path.extname(src) || ".png"}`;
    await saveBuffer(relPath, buf);
    res.json({ localPath: relPath });
  })
);

// POST /characters-stock/save — 생성된 레퍼런스(workspace)를 라이브러리에 저장(덮어쓰기)
router.post(
  "/characters-stock/save",
  asyncHandler(async (req, res) => {
    const { style, archetype, localPath } = req.body;
    if (!style || !archetype || !localPath) {
      res.status(400).json({ error: "style_archetype_localPath_required" });
      return;
    }
    const dst = stockPath(style, archetype);
    await fs.mkdir(path.dirname(dst), { recursive: true });
    await fs.copyFile(absPath(localPath), dst);
    res.json({ saved: true });
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

import fs from "node:fs";
import path from "node:path";

import { Router } from "express";

import { config } from "../config.js";
import { asyncHandler } from "../lib/asyncHandler.js";

const router = Router();

const IMG_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);
const AUDIO_EXT = new Set([".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac"]);

function listDir(dir) {
  try {
    return fs.readdirSync(dir).filter((f) => !f.startsWith("."));
  } catch {
    return [];
  }
}

// GET /templates — 프레임 PNG(알파)
router.get(
  "/templates",
  asyncHandler(async (req, res) => {
    const templates = listDir(config.myTemplatesDir)
      .filter((f) => path.extname(f).toLowerCase() === ".png")
      .map((name) => ({ name, previewPath: `/res/templates/${name}` }));
    res.json({ templates });
  })
);

// GET /samples — 참조 이미지
router.get(
  "/samples",
  asyncHandler(async (req, res) => {
    const samples = listDir(config.mySamplesDir)
      .filter((f) => IMG_EXT.has(path.extname(f).toLowerCase()))
      .map((name) => ({ name, path: `/res/samples/${name}` }));
    res.json({ samples });
  })
);

// GET /styles — <name>.txt + <name>.jpg 짝 (txt 비노출, example_path만)
router.get(
  "/styles",
  asyncHandler(async (req, res) => {
    const files = listDir(config.myStylesDir);
    const txts = files.filter((f) => path.extname(f).toLowerCase() === ".txt");
    const styles = [];
    for (const txt of txts) {
      const name = path.basename(txt, path.extname(txt));
      const jpg = files.find(
        (f) => path.basename(f, path.extname(f)) === name &&
          [".jpg", ".jpeg", ".png", ".webp"].includes(path.extname(f).toLowerCase())
      );
      if (jpg) styles.push({ name, examplePath: `/res/styles/${jpg}` });
    }
    res.json({ styles });
  })
);

// GET /voices — TYPECAST_VOICES env + MY_VOICES_DIR mp3 미리듣기
router.get(
  "/voices",
  asyncHandler(async (req, res) => {
    const voices = (config.typecastVoices || []).map((v) => {
      const voiceId = v.voiceId || v.voice_id;
      const mp3 = path.join(config.myVoicesDir, `${voiceId}.mp3`);
      return {
        voiceId,
        name: v.name,
        previewPath: fs.existsSync(mp3) ? `/res/voices/${voiceId}.mp3` : null,
      };
    });
    res.json({ voices });
  })
);

// GET /sound-effects — my_sound_effect 폴더의 효과음 목록(미리듣기 경로 포함)
router.get(
  "/sound-effects",
  asyncHandler(async (req, res) => {
    const soundEffects = listDir(config.mySoundEffectsDir)
      .filter((f) => AUDIO_EXT.has(path.extname(f).toLowerCase()))
      .map((name) => ({ name, previewPath: `/res/sound-effects/${name}` }));
    res.json({ soundEffects });
  })
);

export default router;

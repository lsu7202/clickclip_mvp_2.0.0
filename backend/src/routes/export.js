import fs from "node:fs";
import path from "node:path";

import { Router } from "express";

import { config } from "../config.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { collectAssets } from "../lib/capcut/collectAssets.js";
import { buildDraft } from "../lib/capcut/draftBuilder.js";
import { buildSrt } from "../lib/capcut/srt.js";
import { resolveFolderName } from "../lib/capcut/folderName.js";

const router = Router();

// POST /export — 실제 CapCut 드래프트 폴더에 직접 생성(§7). CapCut이 바로 인식.
router.post(
  "/export",
  asyncHandler(async (req, res) => {
    const { title, language, templateId, scenes, captions } = req.body;

    const folderName = resolveFolderName(config.capcutDraftRoot, title);
    const draftDir = path.join(config.capcutDraftRoot, folderName); // 컨테이너 쓰기 경로
    const hostDir = `${config.capcutDraftRootHost}/${folderName}`; // 표시용 호스트 경로
    fs.mkdirSync(draftDir, { recursive: true });

    // 입력 불변 유지(capcutPath=호스트 절대경로 주입은 복제본에)
    const scenesCopy = JSON.parse(JSON.stringify(scenes || []));
    const { framePath } = collectAssets(scenesCopy, templateId, folderName, draftDir);

    const { draft, meta } = buildDraft(scenesCopy, {
      title,
      language,
      templateId,
      framePath,
      folderName,
      captions: captions || [],
    });

    fs.writeFileSync(path.join(draftDir, "draft_info.json"), JSON.stringify(draft));
    fs.writeFileSync(path.join(draftDir, "draft_meta_info.json"), JSON.stringify(meta));
    fs.writeFileSync(path.join(draftDir, "subtitles.srt"), buildSrt(scenesCopy));

    res.json({ folderName, draftPath: hostDir });
  })
);

export default router;

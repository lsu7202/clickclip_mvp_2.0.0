// §7.9 collectAssets: workspace 미디어 + 프레임 PNG → <draft>/assets/ 복사,
// 각 Asset.capcutPath 를 CapCut 인식 경로(env 기반)로 재작성.
import fs from "node:fs";
import path from "node:path";

import { config } from "../../config.js";
import { absPath as wsAbs } from "../workspace.js";

// 에셋 경로는 CapCut(호스트)이 읽으므로 호스트 절대경로여야 함:
//   <CAPCUT_DRAFT_ROOT_HOST>/<folder>/assets/<file>
function capcutAssetPath(folderName, fileName) {
  return `${config.capcutDraftRootHost}/${folderName}/assets/${fileName}`;
}

export function collectAssets(scenes, templateId, folderName, draftDir) {
  const assetsDir = path.join(draftDir, "assets");
  fs.mkdirSync(assetsDir, { recursive: true });
  let counter = 0;

  function copyInto(srcAbs, hintExt) {
    const ext = path.extname(srcAbs) || hintExt || "";
    const fileName = `asset-${counter++}${ext}`;
    fs.copyFileSync(srcAbs, path.join(assetsDir, fileName));
    return { fileName, capcutPath: capcutAssetPath(folderName, fileName) };
  }

  // 동일 원본은 한 번만 복사(자막2 분할 시 두 장면이 같은 파일을 source 윈도우만 달리 가리킴)
  const copiedByPath = new Map();
  function copyMediaOnce(localPath) {
    if (copiedByPath.has(localPath)) return copiedByPath.get(localPath);
    const { capcutPath } = copyInto(wsAbs(localPath));
    copiedByPath.set(localPath, capcutPath);
    return capcutPath;
  }

  // 미디어
  for (const scene of scenes) {
    if (scene.media?.localPath) {
      scene.media.capcutPath = copyMediaOnce(scene.media.localPath);
    }
    // 자막1 TTS 오디오(장면당 합친 1개)
    if (scene.sceneTts?.localPath) {
      scene.sceneTts.capcutPath = copyMediaOnce(scene.sceneTts.localPath);
    }
    // 장면 시작 효과음
    if (scene.startSfx?.localPath) {
      scene.startSfx.capcutPath = copyMediaOnce(scene.startSfx.localPath);
    }
  }

  // 프레임 오버레이 PNG
  let framePath = null;
  if (templateId) {
    const srcAbs = path.join(config.myTemplatesDir, templateId);
    if (fs.existsSync(srcAbs)) {
      const { capcutPath } = copyInto(srcAbs, ".png");
      framePath = capcutPath;
    }
  }

  return { framePath };
}

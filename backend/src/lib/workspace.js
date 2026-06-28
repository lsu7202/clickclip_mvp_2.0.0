// WORKSPACE_DIR 파일 저장 유틸. 반환 경로는 workspace '상대경로'(localPath).
import fs from "node:fs/promises";
import path from "node:path";

import axios from "axios";

import { config } from "../config.js";

export function absPath(relPath) {
  return path.join(config.workspaceDir, relPath);
}

async function ensureDir(relDir) {
  await fs.mkdir(path.join(config.workspaceDir, relDir), { recursive: true });
}

// Buffer 저장 → relPath 반환
export async function saveBuffer(relPath, buffer) {
  await ensureDir(path.dirname(relPath));
  await fs.writeFile(absPath(relPath), buffer);
  return relPath;
}

export async function saveBase64(relPath, base64) {
  return saveBuffer(relPath, Buffer.from(base64, "base64"));
}

// 원격 URL → workspace 저장
export async function downloadTo(relPath, url) {
  const resp = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 120000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });
  return saveBuffer(relPath, Buffer.from(resp.data));
}

export function extFromUrl(url, fallback) {
  const clean = url.split("?")[0];
  const ext = path.extname(clean);
  return ext || fallback;
}

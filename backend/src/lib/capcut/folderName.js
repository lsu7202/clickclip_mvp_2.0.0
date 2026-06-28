// §7.7 폴더명 규칙: 금칙문자 제거 → trim → 빈값 fallback → 충돌 시 -N 접미사
import fs from "node:fs";
import path from "node:path";

const FORBIDDEN = /[/\\:*?"<>|]/g;

export function sanitizeTitle(title) {
  const clean = String(title || "").replace(FORBIDDEN, "").trim();
  return clean || "clickclip";
}

// CAPCUT_DRAFT_ROOT 아래 충돌 없는 최종 폴더명
export function resolveFolderName(draftRoot, title) {
  const base = sanitizeTitle(title);
  let name = base;
  let n = 2;
  while (fs.existsSync(path.join(draftRoot, name))) {
    name = `${base}-${n}`;
    n += 1;
  }
  return name;
}

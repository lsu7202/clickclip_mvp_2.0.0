// §7.8 SRT: 자막1(내레이션) 기준 누적 절대 타임코드.
import { sceneStartsUs, subtitle1LineStartsUs, lineDurationUs } from "../timing.js";

function timecode(us) {
  const totalMs = Math.round(us / 1000);
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
}

export function buildSrt(scenes) {
  const { starts } = sceneStartsUs(scenes);
  const entries = [];
  scenes.forEach((scene, si) => {
    const lineStarts = subtitle1LineStartsUs(scene);
    (scene.subtitle1Lines || []).forEach((ln, li) => {
      const dur = lineDurationUs(ln);
      if (dur <= 0 || !ln.text?.trim()) return;
      const startUs = starts[si] + lineStarts[li];
      entries.push({ startUs, endUs: startUs + dur, text: ln.text });
    });
  });
  return entries
    .map(
      (e, i) =>
        `${i + 1}\n${timecode(e.startUs)} --> ${timecode(e.endUs)}\n${e.text}\n`
    )
    .join("\n");
}

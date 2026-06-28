// §3.6 계산 규칙. 프론트와 동일 로직(SSOT는 명세).
import { config } from "../config.js";

export function ttsTotalUs(scene) {
  return (scene.subtitle1Lines || []).reduce(
    (sum, ln) => sum + (ln.tts?.durationUs || 0),
    0
  );
}

// 미디어 소스 윈도우(자막2 분할 시 한 파일 공유 + source 오프셋만 다름)
export function mediaSrcStart(media) {
  return media?.sourceStartUs ?? 0;
}
export function mediaSrcEnd(media) {
  return media?.sourceEndUs ?? media?.durationUs ?? 0;
}
export function mediaUsedUs(media) {
  if (!media) return null;
  if (media.sourceStartUs != null || media.sourceEndUs != null) {
    return Math.max(0, mediaSrcEnd(media) - mediaSrcStart(media));
  }
  return media.durationUs ?? null;
}

// (a) 장면 길이. manualDurationUs(수동 override) 우선 — 비디오는 트림만(min), 스틸/빈은 그대로.
export function sceneDurationUs(scene) {
  const tts = ttsTotalUs(scene);
  const mediaUs = mediaUsedUs(scene.media);
  const still = config.defaultStillUs;
  if (scene.manualDurationUs != null) {
    return mediaUs != null ? Math.min(scene.manualDurationUs, mediaUs) : scene.manualDurationUs;
  }
  if (scene.fitToTts) {
    return tts > 0 ? tts : mediaUs ?? still;
  }
  return mediaUs ?? (tts > 0 ? tts : still);
}

// (c) 장면 전역 시작
export function sceneStartsUs(scenes) {
  const starts = [];
  let acc = 0;
  for (const sc of scenes) {
    starts.push(acc);
    acc += sceneDurationUs(sc);
  }
  return { starts, totalUs: acc };
}

// (d) 자막1 줄 시작(장면 내 누적)
export function subtitle1LineStartsUs(scene) {
  const starts = [];
  let acc = 0;
  for (const ln of scene.subtitle1Lines || []) {
    starts.push(acc);
    acc += ln.tts?.durationUs || 0;
  }
  return starts;
}

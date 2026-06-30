// §3.6 계산 규칙. 프론트와 동일 로직(SSOT는 명세).
import { config } from "../config.js";

// 장면 TTS는 줄들을 합쳐 1회 합성한 오디오 1개 → 전체 길이가 곧 발화 길이.
export function ttsTotalUs(scene) {
  return scene.sceneTts?.durationUs || 0;
}

// 자막1 줄 표시 길이(합친 오디오 내 [start,end] 범위)
export function lineDurationUs(ln) {
  return ln.ttsRange ? Math.max(0, ln.ttsRange.endUs - ln.ttsRange.startUs) : 0;
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

// (d) 자막1 줄 시작(합친 오디오 내 char 타이밍 기반 오프셋)
export function subtitle1LineStartsUs(scene) {
  return (scene.subtitle1Lines || []).map((ln) => ln.ttsRange?.startUs ?? 0);
}

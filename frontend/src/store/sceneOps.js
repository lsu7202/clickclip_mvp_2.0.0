// 장면/줄 순수 변환 헬퍼(§3.6). 모두 불변(새 배열/객체 반환).

export const DEFAULT_STILL_US = 3_000_000;

export function renumber(scenes) {
  return scenes.map((sc, i) => ({
    ...sc,
    sceneNumber: i + 1,
    subtitle1Lines: sc.subtitle1Lines.map((ln, j) => ({ ...ln, lineNumber: j + 1 })),
  }));
}

// 장면 TTS는 줄들을 합쳐 1회 합성한 오디오 1개 → 그 전체 길이가 발화 길이.
export function ttsTotalUs(scene) {
  return scene.sceneTts?.durationUs || 0;
}
export function lineDurationUs(ln) {
  return ln.ttsRange ? Math.max(0, ln.ttsRange.endUs - ln.ttsRange.startUs) : 0;
}

// 미디어 소스 윈도우(자막2 분할 시 한 파일을 공유하고 [start,end]만 다르게 가리킴).
// sourceStartUs/sourceEndUs 없으면 전체 [0, durationUs].
export function mediaSrcStart(media) {
  return media?.sourceStartUs ?? 0;
}
export function mediaSrcEnd(media) {
  return media?.sourceEndUs ?? media?.durationUs ?? 0;
}
// 이 장면이 실제로 쓰는 미디어 길이(윈도우 길이). 이미지(durationUs null)면 null.
export function mediaUsedUs(media) {
  if (!media) return null;
  if (media.sourceStartUs != null || media.sourceEndUs != null) {
    return Math.max(0, mediaSrcEnd(media) - mediaSrcStart(media));
  }
  return media.durationUs ?? null;
}

// (a) 장면 길이. manualDurationUs(수동 override)가 있으면 그것을 쓰되,
//     비디오는 트림만(연장은 별도 프리즈 장면으로) → min(manual, 비디오길이).
//     스틸/빈/프리즈(mediaUs=null)는 수동값 그대로.
export function sceneDurationUs(scene) {
  const tts = ttsTotalUs(scene);
  const mediaUs = mediaUsedUs(scene.media); // 비디오 길이 or null(이미지/없음)
  if (scene.manualDurationUs != null) {
    return mediaUs != null ? Math.min(scene.manualDurationUs, mediaUs) : scene.manualDurationUs;
  }
  if (scene.fitToTts) return tts > 0 ? tts : mediaUs ?? DEFAULT_STILL_US;
  return mediaUs ?? (tts > 0 ? tts : DEFAULT_STILL_US);
}

export function totalDurationUs(scenes) {
  return scenes.reduce((s, sc) => s + sceneDurationUs(sc), 0);
}

export function sceneStartUs(scenes, index) {
  let acc = 0;
  for (let i = 0; i < index; i += 1) acc += sceneDurationUs(scenes[i]);
  return acc;
}

export function newSubtitle1Line(text = "") {
  // ttsRange: 장면 합친 오디오 내 이 줄의 [start,end]. 성우는 장면 단위(합성이라 줄별 불가).
  return { lineNumber: 0, text, ttsText: text, ttsTextEdited: false, ttsRange: null };
}

export function emptyScene(voiceId, fitToTts = true) {
  return {
    sceneNumber: 0,
    media: null,
    voiceId,
    muted: false,
    fitToTts,
    subtitle1Lines: [],
    durationUs: 0,
  };
}

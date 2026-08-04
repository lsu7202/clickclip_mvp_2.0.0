// 장면/줄 기본값 하이드레이트(§5.1, §3.6). 백엔드에서 완전체 Scene 으로 채워 반환.
import { config } from "../config.js";

export function defaultVoiceId() {
  return config.typecastVoices[0]?.voiceId || config.typecastVoices[0]?.voice_id || "";
}

// 나레이션 자막 줄 1개를 완전체로
export function hydrateSubtitle1Line(line) {
  return {
    lineNumber: line.lineNumber,
    text: line.text,
    ttsText: line.text,
    ttsTextEdited: false,
    ttsRange: null,
  };
}

// 대본 분할 장면(fitToTts=true)
export function hydrateSplitScene(scene) {
  return {
    sceneNumber: scene.sceneNumber,
    media: null,
    voiceId: defaultVoiceId(),
    muted: false,
    fitToTts: true,
    subtitle1Lines: (scene.subtitle1Lines || []).map(hydrateSubtitle1Line),
    commentaryLines: [],
    durationUs: 0,
  };
}

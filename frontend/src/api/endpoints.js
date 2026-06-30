// 백엔드 엔드포인트 래퍼(§1.10). 전부 camelCase in/out(인터셉터가 wire 변환).
import api from "./client.js";

export const splitScenes = (scriptText, language) =>
  api.post("/scenes/split", { scriptText, language }).then((r) => r.data.scenes);

export const generateSceneTts = (payload) =>
  // payload: { sceneNumber, lines:[{lineNumber, ttsText}], voiceId, language }
  //   → { localPath, durationUs, lineRanges:[{lineNumber, startUs, endUs}] }
  // 장면의 자막1 줄들을 합쳐 1회 합성(자연스러운 발화) + char 타이밍으로 줄별 시간 복원
  api.post("/tts", payload).then((r) => r.data);

export const generateAiMedia = (payload) =>
  // payload: { mediaType, styleId, situationText, referenceName, aspectRatio } → Asset
  api.post("/ai-media/generate", payload).then((r) => r.data);

export const downloadAsset = (url) =>
  api.post("/assets/download", { url }).then((r) => r.data);

export const extractFrame = (localPath, atUs) =>
  // 동영상 프레임 추출 → 프리즈용 이미지 Asset
  api.post("/assets/extract-frame", { localPath, atUs }).then((r) => r.data);

export const uploadAsset = (file) => {
  const fd = new FormData();
  fd.append("file", file);
  return api.post("/assets/upload", fd).then((r) => r.data);
};

// 효과음 라이브러리(my_sound_effect 폴더)
export const getSoundEffects = () =>
  api.get("/sound-effects").then((r) => r.data.soundEffects);
export const selectSoundEffect = (name) =>
  // 라이브러리 효과음을 workspace로 복사 → { localPath, durationUs }
  api.post("/sound-effects/use", { name }).then((r) => r.data);

export const searchGif = (q) =>
  api.get("/search/gif", { params: { q } }).then((r) => r.data.results);
export const searchImage = (q) =>
  api.get("/search/image", { params: { q } }).then((r) => r.data.results);

export const getTemplates = () => api.get("/templates").then((r) => r.data.templates);
export const getSamples = () => api.get("/samples").then((r) => r.data.samples);
export const getStyles = () => api.get("/styles").then((r) => r.data.styles);
export const getVoices = () => api.get("/voices").then((r) => r.data.voices);

export const startVideoAnalysis = ({ video, language, targetSceneNumber, applySubtitle }) => {
  const fd = new FormData();
  fd.append("video", video);
  fd.append("language", language);
  fd.append("target_scene_number", String(targetSceneNumber));
  fd.append("apply_subtitle", String(applySubtitle));
  return api.post("/video-analysis", fd).then((r) => r.data.jobId);
};

export const getJob = (jobId) => api.get(`/jobs/${jobId}`).then((r) => r.data);

export const translateTexts = (texts, target) =>
  api.post("/translate", { texts, target }).then((r) => r.data.translations);

export const exportDraft = ({ title, language, templateId, scenes, captions }) =>
  api.post("/export", { title, language, templateId, scenes, captions }).then((r) => r.data);

// 환경변수 단일 로딩(§1.9). 이름은 식별자 사전과 1:1.

function jsonEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export const config = {
  port: parseInt(process.env.PORT || "4000", 10),
  aiServerUrl: process.env.AI_SERVER_URL || "http://ai_server:8000",

  canvasWidth: parseInt(process.env.CANVAS_WIDTH || "1080", 10),
  canvasHeight: parseInt(process.env.CANVAS_HEIGHT || "1920", 10),
  defaultStillUs: parseInt(process.env.DEFAULT_STILL_US || "3000000", 10),

  // 자막1 TTS 앞뒤 무음 제거(A). 기본 on. 임계값(dB) 이하를 무음으로 간주.
  // TTS 진짜 무음은 -80dB 미만(디지털 무음)이라 보수적으로 -60dB → 말끝 감쇠 보존.
  ttsTrimSilence: (process.env.TTS_TRIM_SILENCE || "true") !== "false",
  ttsSilenceThresholdDb: parseInt(process.env.TTS_SILENCE_THRESHOLD_DB || "-60", 10),

  // 보이스맵(ai/backend 공유)
  typecastVoices: jsonEnv("TYPECAST_VOICES", []),

  // 검색
  giphyApiKey: process.env.GIPHY_API_KEY || "",
  giphyLimit: parseInt(process.env.GIPHY_LIMIT || "24", 10),
  serpApiKey: process.env.SERPAPI_KEY || "",

  // 리소스 폴더(bind mount)
  myTemplatesDir: process.env.MY_TEMPLATES_DIR || "/resources/my_templates",
  mySamplesDir: process.env.MY_SAMPLES_DIR || "/resources/my_samples",
  myStylesDir: process.env.MY_STYLES_DIR || "/resources/my_styles",
  myVoicesDir: process.env.MY_VOICES_DIR || "/resources/my_voices",
  mySoundEffectsDir: process.env.MY_SOUND_EFFECTS_DIR || "/resources/my_sound_effect",

  // CapCut export
  capcutDraftRoot: process.env.CAPCUT_DRAFT_ROOT || "/capcut_drafts", // 컨테이너 쓰기 경로
  capcutDraftRootHost: process.env.CAPCUT_DRAFT_ROOT_HOST || "/capcut_drafts", // JSON에 박는 호스트 절대경로
  capcutTemplateDir: process.env.CAPCUT_TEMPLATE_DIR || "/resources/capcut_template",
  capcutFontPath: process.env.CAPCUT_FONT_PATH || "/resources/fonts/font.ttf",

  // workspace
  workspaceDir: process.env.WORKSPACE_DIR || "/workspace",
};

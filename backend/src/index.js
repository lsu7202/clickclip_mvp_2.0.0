import cors from "cors";
import express from "express";

import { config } from "./config.js";
import { caseConvert } from "./middleware/caseConvert.js";
import scenesRouter from "./routes/scenes.js";
import ttsRouter from "./routes/tts.js";
import aiMediaRouter from "./routes/aiMedia.js";
import assetsRouter from "./routes/assets.js";
import searchRouter from "./routes/search.js";
import resourcesRouter from "./routes/resources.js";
import videoAnalysisRouter from "./routes/videoAnalysis.js";
import translateRouter from "./routes/translate.js";
import exportRouter from "./routes/export.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(caseConvert);

// 정적 서빙: 생성 에셋 + 사용자 리소스 프리뷰
app.use("/workspace", express.static(config.workspaceDir));
app.use("/res/templates", express.static(config.myTemplatesDir));
app.use("/res/samples", express.static(config.mySamplesDir));
app.use("/res/styles", express.static(config.myStylesDir));
app.use("/res/voices", express.static(config.myVoicesDir));
app.use("/res/sound-effects", express.static(config.mySoundEffectsDir));

app.get("/health", (req, res) => res.json({ status: "ok", service: "backend" }));

app.use(scenesRouter);
app.use(ttsRouter);
app.use(aiMediaRouter);
app.use(assetsRouter);
app.use(searchRouter);
app.use(resourcesRouter);
app.use(videoAnalysisRouter);
app.use(translateRouter);
app.use(exportRouter);

// 에러 핸들러(공통). camel→snake 는 caseConvert 가 처리.
app.use((err, req, res, next) => {
  console.error(`[error] ${req.method} ${req.path}:`, err?.message || err);
  res.status(err.status || 500).json({
    error: err?.message || "internal_error",
  });
});

app.listen(config.port, () => {
  console.log(`[backend] listening on :${config.port} → AI ${config.aiServerUrl}`);
});

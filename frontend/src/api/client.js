// 프론트 API 클라이언트(§2.2 #1). 요청 camel→snake, 응답 snake→camel.
// FormData 업로드는 변환 제외.
import axios from "axios";

import { camelToSnake, snakeToCamel } from "./caseUtil.js";

export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "http://localhost:4000";

const api = axios.create({ baseURL: BACKEND_URL, timeout: 600000 });

api.interceptors.request.use((cfg) => {
  if (cfg.data && !(cfg.data instanceof FormData)) {
    cfg.data = camelToSnake(cfg.data);
  }
  if (cfg.params) cfg.params = camelToSnake(cfg.params);
  return cfg;
});

api.interceptors.response.use(
  (resp) => {
    resp.data = snakeToCamel(resp.data);
    return resp;
  },
  (err) => Promise.reject(err)
);

// localPath(workspace 상대) → 정적 URL
export const workspaceUrl = (localPath) =>
  localPath ? `${BACKEND_URL}/workspace/${localPath}` : "";
// 리소스 path(/res/... 로 시작) → 절대 URL
export const resUrl = (p) => (p ? `${BACKEND_URL}${p}` : "");

export default api;

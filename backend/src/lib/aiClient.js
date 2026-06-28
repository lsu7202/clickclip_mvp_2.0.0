// 백엔드 → AI 서버 호출(§2.2). 나가는 camel→snake, 들어오는 snake→camel.
// AI 서버는 wire(snake) 그대로이므로 변환은 이 클라이언트가 전담.
import axios from "axios";

import { config } from "../config.js";
import { camelToSnake, snakeToCamel } from "./caseUtil.js";

const http = axios.create({
  baseURL: config.aiServerUrl,
  timeout: 600000, // AI 생성/분석은 길 수 있음
  maxBodyLength: Infinity, // base64 비디오/오디오 대용량 허용
  maxContentLength: Infinity,
});

export async function aiPost(path, camelBody) {
  const { data } = await http.post(path, camelToSnake(camelBody));
  return snakeToCamel(data);
}

export async function aiGet(path) {
  const { data } = await http.get(path);
  return snakeToCamel(data);
}

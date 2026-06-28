// 경계 변환 미들웨어(§2.2 #2):
//   요청 body: snake → camel (단, multipart 업로드는 제외)
//   응답 res.json: camel → snake
import { camelToSnake, snakeToCamel } from "../lib/caseUtil.js";

export function caseConvert(req, res, next) {
  const isMultipart = (req.headers["content-type"] || "").includes(
    "multipart/form-data"
  );
  if (!isMultipart && req.body && typeof req.body === "object") {
    req.body = snakeToCamel(req.body);
  }

  const originalJson = res.json.bind(res);
  res.json = (payload) => originalJson(camelToSnake(payload));

  next();
}

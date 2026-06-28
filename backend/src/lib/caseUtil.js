// 이름 흔들림 차단의 핵심: 키 변환은 오직 경계에서만(§2.2).
// 값은 건드리지 않고 객체 '키'만 재귀 변환한다.

const toSnake = (s) => s.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
const toCamel = (s) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

function convertKeys(value, fn) {
  if (Array.isArray(value)) {
    return value.map((v) => convertKeys(v, fn));
  }
  if (value !== null && typeof value === "object") {
    // 특수 객체(Buffer/Date 등)는 그대로
    if (Buffer.isBuffer(value) || value instanceof Date) return value;
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[fn(k)] = convertKeys(v, fn);
    }
    return out;
  }
  return value;
}

export const camelToSnake = (obj) => convertKeys(obj, toSnake);
export const snakeToCamel = (obj) => convertKeys(obj, toCamel);

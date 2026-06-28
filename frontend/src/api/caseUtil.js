// 경계 변환(§2.2 #1). 키만 재귀 변환. 값 불변.
const toSnake = (s) => s.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
const toCamel = (s) => s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

function convert(value, fn) {
  if (Array.isArray(value)) return value.map((v) => convert(v, fn));
  if (value && typeof value === "object") {
    if (value instanceof FormData || value instanceof Blob || value instanceof File) {
      return value;
    }
    const out = {};
    for (const [k, v] of Object.entries(value)) out[fn(k)] = convert(v, fn);
    return out;
  }
  return value;
}

export const camelToSnake = (o) => convert(o, toSnake);
export const snakeToCamel = (o) => convert(o, toCamel);

// 서버 리소스 목록 캐시(템플릿/보이스/스타일/참조). 모듈 단위 1회 로딩.
import { useEffect, useState } from "react";

import {
  getSamples,
  getSoundEffects,
  getStyles,
  getTemplates,
  getVoices,
} from "../api/endpoints.js";

const cache = { templates: null, voices: null, styles: null, samples: null, soundEffects: null };

function useResource(key, fetcher) {
  const [data, setData] = useState(cache[key] || []);
  useEffect(() => {
    let alive = true;
    if (cache[key]) {
      setData(cache[key]);
      return;
    }
    fetcher()
      .then((d) => {
        cache[key] = d;
        if (alive) setData(d);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [key]);
  return data;
}

export const useTemplates = () => useResource("templates", getTemplates);
export const useVoices = () => useResource("voices", getVoices);
export const useStyles = () => useResource("styles", getStyles);
export const useSamples = () => useResource("samples", getSamples);
export const useSoundEffects = () => useResource("soundEffects", getSoundEffects);

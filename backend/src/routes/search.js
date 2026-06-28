import axios from "axios";
import { Router } from "express";

import { config } from "../config.js";
import { asyncHandler } from "../lib/asyncHandler.js";

const router = Router();

// GET /search/gif?q= — Giphy (수동검색, q 50자 캡)
router.get(
  "/search/gif",
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || "").slice(0, 50);
    if (!q.trim()) return res.json({ results: [] });
    const { data } = await axios.get("https://api.giphy.com/v1/gifs/search", {
      params: { api_key: config.giphyApiKey, q, limit: config.giphyLimit },
      timeout: 30000,
    });
    const results = (data.data || []).map((g) => {
      const img = g.images?.original || g.images?.fixed_width || {};
      return {
        url: img.url,
        widthPx: parseInt(img.width, 10) || 0,
        heightPx: parseInt(img.height, 10) || 0,
      };
    });
    res.json({ results });
  })
);

// GET /search/image?q= — SerpAPI Google Images (q 100자 캡)
router.get(
  "/search/image",
  asyncHandler(async (req, res) => {
    const q = String(req.query.q || "").slice(0, 100);
    if (!q.trim()) return res.json({ results: [] });
    const { data } = await axios.get("https://serpapi.com/search.json", {
      params: { engine: "google_images", q, api_key: config.serpApiKey },
      timeout: 30000,
    });
    const results = (data.images_results || []).map((it) => ({
      url: it.original,
      widthPx: parseInt(it.original_width, 10) || 0,
      heightPx: parseInt(it.original_height, 10) || 0,
    }));
    res.json({ results });
  })
);

export default router;

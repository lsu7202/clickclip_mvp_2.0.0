import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// VITE_BACKEND_URL 은 컨테이너 env 로 주입(compose). 빌드시 define 으로 노출.
export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    watch: { usePolling: true }, // 도커 바인드마운트 HMR
  },
  define: {
    "import.meta.env.VITE_BACKEND_URL": JSON.stringify(
      process.env.VITE_BACKEND_URL || "http://localhost:4000"
    ),
  },
});

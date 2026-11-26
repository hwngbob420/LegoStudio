import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// LSE_SERVER_PORT / STUDIO_PORT: chạy thêm một bản thử song song khi Studio chính đang mở
const server = `http://127.0.0.1:${process.env.LSE_SERVER_PORT ?? 8788}`;
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { dedupe: ["react", "react-dom", "remotion", "three", "@react-three/fiber"] },
  server: {
    port: Number(process.env.STUDIO_PORT ?? 5174),
    strictPort: true,
    host: "127.0.0.1",
    proxy: { "/api": server, "/baked": server, "/ws": server },
  },
});

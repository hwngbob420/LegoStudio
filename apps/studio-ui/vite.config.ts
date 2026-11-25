import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const server = "http://127.0.0.1:8788";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { dedupe: ["react", "react-dom", "remotion", "three", "@react-three/fiber"] },
  server: {
    port: 5174,
    strictPort: true,
    host: "127.0.0.1",
    proxy: { "/api": server, "/baked": server, "/ws": server },
  },
});

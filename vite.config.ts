import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "../aivrasol-pos/node_modules/vite/dist/node/index.js";
import react from "../aivrasol-pos/node_modules/@vitejs/plugin-react/dist/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const posNodeModules = path.resolve(__dirname, "../aivrasol-pos/node_modules");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      react: path.join(posNodeModules, "react"),
      "react-dom": path.join(posNodeModules, "react-dom"),
      "react/jsx-runtime": path.join(posNodeModules, "react/jsx-runtime"),
      "react/jsx-dev-runtime": path.join(posNodeModules, "react/jsx-dev-runtime"),
    },
  },
  build: {
    outDir: "dist/client",
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    proxy: {
      "/api": {
        target: "http://localhost:8787",
        changeOrigin: false,
      },
    },
  },
});

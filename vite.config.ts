import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import dts from "vite-plugin-dts";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    dts({
      insertTypesEntry: true,
    }),
    react({
      jsxImportSource: "@emotion/react",
      babel: {
        plugins: ["@emotion/babel-plugin"],
      },
    }),
  ],
  resolve: {
    alias: [{ find: "@", replacement: "/src" }],
  },
  server: {
    proxy: {
      "/api/elevation": {
        target: "https://api.opentopodata.org",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/elevation/, "/v1/aster30m"),
      },
      "/api/imagery": {
        target: "https://tiles.maps.eox.at",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/imagery/, "/wms"),
      },
    },
  },
});

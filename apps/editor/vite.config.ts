import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";
import { defineConfig, loadEnv, type Plugin, type ProxyOptions } from "vite";
import { handleMergeConflict } from "./server/mergeConflict.ts";
import { handleWorkBridge } from "./server/workBridge.ts";

const editorRoot = path.dirname(fileURLToPath(import.meta.url));
const appVersion = String(JSON.parse(fs.readFileSync(path.join(editorRoot, "package.json"), "utf8")).version || "");
/** 与 blog server 共用仓库根 `.env`（GATEWAY_BASE_URL 等） */
const repoRoot = path.resolve(editorRoot, "../..");

function gatewayProxy(target: string): Record<string, ProxyOptions> {
  const common: ProxyOptions = {
    target,
    changeOrigin: true,
    secure: true,
  };
  const withWs: ProxyOptions = { ...common, ws: true };
  return {
    "/auth": common,
    "/wiki": withWs,
  };
}

export default defineConfig(({ mode }) => {
  const rootEnv = loadEnv(mode, repoRoot, "");
  const gatewayBase = (
    rootEnv.GATEWAY_BASE_URL ||
    rootEnv.NEST_BASE_URL ||
    rootEnv.VITE_GATEWAY_BASE_URL ||
    "https://api.championsea.online"
  ).replace(/\/$/, "");

  /**
   * 浏览器一律同源（空串），避免跨域。
   * 真实 Nest 地址只给 Vite / 桌面本地服务做代理目标。
   * 若必须直连，可设 VITE_GATEWAY_PUBLIC_BASE。
   */
  const browserBase = (rootEnv.VITE_GATEWAY_PUBLIC_BASE ?? "").replace(/\/$/, "");

  return {
    clearScreen: false,
    plugins: [react(), tailwindcss(), mergePlugin(gatewayBase), workBridgePlugin()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: vendorChunk,
        },
      },
    },
    envDir: repoRoot,
    envPrefix: ["VITE_", "TAURI_"],
    define: {
      "import.meta.env.VITE_GATEWAY_BASE_URL": JSON.stringify(browserBase),
      "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion),
    },
    server: {
      host: "0.0.0.0",
      port: 5174,
      strictPort: true,
      proxy: gatewayProxy(gatewayBase),
      watch: {
        // 发布会改写 release 和 shared 产物。不忽略的话开发页会连刷十几次，
        // Safari 会把被取消的模块报成 Importing a module script failed，然后停在白屏。
        ignored: ["**/src-tauri/**", "**/release/**"],
        awaitWriteFinish: {
          stabilityThreshold: 300,
          pollInterval: 50,
        },
      },
    },
    preview: {
      host: "0.0.0.0",
      port: 5174,
      strictPort: true,
      proxy: gatewayProxy(gatewayBase),
    },
  };
});

/**
 * 首屏一定会用到、又很少升级的第三方库单独成块，发版后浏览器仍能用缓存。
 * 只按需加载的库（pdfmake、xlsx、docx 等）不要写进来，否则会被拉进首屏。
 */
const VENDOR_CHUNKS: Array<[name: string, packages: string[]]> = [
  ["react", ["react", "react-dom", "scheduler", "react-router"]],
  ["editorjs", ["@editorjs", "editorjs-drag-drop"]],
  ["radix", ["radix-ui", "@radix-ui", "@floating-ui"]],
  ["i18n", ["i18next", "react-i18next"]],
];

function vendorChunk(id: string): string | undefined {
  const match = id.match(/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)/);
  if (!match) return undefined;
  const pkg = match[1];
  for (const [name, packages] of VENDOR_CHUNKS) {
    if (packages.some((item) => pkg === item || pkg.startsWith(`${item}/`))) {
      return `vendor-${name}`;
    }
  }
  return undefined;
}

function mergePlugin(gatewayBase: string): Plugin {
  return {
    name: "wiki-merge-conflict",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleMergeConflict(req, res, gatewayBase).then((hit) => {
          if (!hit) next();
        });
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleMergeConflict(req, res, gatewayBase).then((hit) => {
          if (!hit) next();
        });
      });
    },
  };
}

function workBridgePlugin(): Plugin {
  return {
    name: "wiki-work-bridge",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleWorkBridge(req, res).then((hit) => {
          if (!hit) {
            next();
          }
        });
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        void handleWorkBridge(req, res).then((hit) => {
          if (!hit) {
            next();
          }
        });
      });
    },
  };
}

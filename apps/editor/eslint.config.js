import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "release", "src-tauri", "public", "node_modules"] },
  {
    files: ["src/**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      // 只开 Hooks 的两条经典规则；插件自带的 React Compiler 规则对现有写法（渲染时同步 ref 等）太严。
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // 未使用的变量交给 tsc 的 noUnusedLocals，避免两边重复报。
      "@typescript-eslint/no-unused-vars": "off",
    },
  },
);

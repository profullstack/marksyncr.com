import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    files: ["**/*.js", "**/*.jsx"],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        ...globals.es2024,
        chrome: "readonly",
        browser: "readonly",
      },
    },
    rules: {
      // Disable unused vars check for extension - many are intentionally defined for future use
      // or are part of callback signatures (e.g., browser event listeners)
      "no-unused-vars": "off",
      "no-console": "off",
    },
  },
  {
    ignores: ["**/node_modules/**", "**/dist/**", "**/build/**", "**/coverage/**"],
  },
];

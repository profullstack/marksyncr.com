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
        ...globals.node,
        ...globals.es2024,
        React: "readonly",
      },
    },
    rules: {
      // Disable unused vars check for web app - many are intentionally defined for future use
      // or are React components/hooks that may be conditionally used
      "no-unused-vars": "off",
      "no-console": "off",
    },
  },
  {
    ignores: ["**/node_modules/**", "**/dist/**", "**/.next/**", "**/coverage/**"],
  },
];

/**
 * ESLint configuration for the project.
 *
 * See https://eslint.style and https://typescript-eslint.io for additional linting options.
 */
// @ts-check
import js from "@eslint/js";
import stylistic from "@stylistic/eslint-plugin";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [".vscode-test", "out", "dist", "test-workspace/*.js", "test-workspace/*.js.map"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...tseslint.configs.stylistic,
  {
    plugins: {
      "@stylistic": stylistic,
      "simple-import-sort": simpleImportSort,
    },
    rules: {
      curly: "warn",
      // A single group keeps imports contiguous: side effects, packages, absolute, then relative.
      "simple-import-sort/imports": ["warn", { groups: [["^\\u0000", "^@?\\w", "^", "^\\."]] }],
      "@stylistic/semi": ["warn", "always"],
      "@stylistic/max-len": [
        "warn",
        {
          code: 100,
          comments: 100,
          ignoreUrls: true,
          ignoreStrings: true,
          ignoreTemplateLiterals: true,
        },
      ],
      "@typescript-eslint/no-empty-function": "off",
      "@typescript-eslint/naming-convention": [
        "warn",
        {
          selector: "import",
          format: ["camelCase", "PascalCase"],
        },
      ],
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
        },
      ],
    },
  }
);

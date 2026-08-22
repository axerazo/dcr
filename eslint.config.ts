import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import { defineConfig } from "eslint/config";

export default defineConfig([
  { files: ["**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"], languageOptions: { globals: {...globals.browser, ...globals.node} } },
  tseslint.configs.recommended,
  pluginReact.configs.flat['jsx-runtime'],
  {
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    // Playwright fixtures call `use(value)` to hand a fixture to the test.
    // react-hooks/rules-of-hooks sees the name and flags it as a misplaced
    // React hook. It is a false positive — there is no React in e2e/ — so the
    // rule is switched off for this directory only.
    files: ["e2e/**/*.ts"],
    rules: { "react-hooks/rules-of-hooks": "off" },
  },
  {
    // dist and node_modules as before; supabase/.temp holds minified bundles
    // that `supabase start` generates (already gitignored via
    // supabase/.gitignore) and must not be linted as project source.
    ignores: ["dist/**", "node_modules/**", "supabase/.temp/**"],
  },
]);

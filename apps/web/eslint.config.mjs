// TODO(modernization): apps/web is pinned to eslint 9.x while the repo root
// runs eslint 10. eslint-config-next@16.3.0 depends on eslint-plugin-react
// ^7.37, whose peer range caps at eslint ^9.7 and which crashes under
// eslint 10 (`context.getFilename` was removed). Re-align to eslint 10 once
// eslint-config-next ships an eslint-10-compatible eslint-plugin-react.
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;

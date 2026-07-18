import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const config = [
  ...nextCoreWebVitals,
  ...nextTypeScript,
  { rules: { "@typescript-eslint/no-explicit-any": "off" } },
  { ignores: [".open-next/**", ".next/**", ".wrangler/**"] },
];

export default config;

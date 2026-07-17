/**
 * Runs the point-of-harm engine tests:  node extension/test.mjs
 *
 * The project has no test runner, and adding one for a pure, dependency-free
 * engine would be more machinery than the job needs. esbuild is already present,
 * so we bundle the test to a temp file and run it under node.
 */

import * as esbuild from "esbuild";
import { spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import os from "node:os";

const root = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(os.tmpdir(), `guidr-engine-test-${Date.now()}.mjs`);

await esbuild.build({
  entryPoints: [path.join(root, "src", "engine.test.ts")],
  outfile: out,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node18",
});

const res = spawnSync(process.execPath, [out], { stdio: "inherit" });
await rm(out, { force: true });
process.exit(res.status ?? 1);

import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const args of [
  ["exec", "tsc", "--", "-b"],
  ["exec", "vite", "--", "build", "--mode", "desktop"],
]) {
  const r = spawnSync("npm", args, {
    cwd: resolve(root, "ui"),
    stdio: "inherit",
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=2048" },
  });
  if (r.status) process.exit(r.status);
}

import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { packageMac, electronTemplate } from "../core/packager.mjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const product = JSON.parse(
  await readFile(resolve(root, "product.json"), "utf8"),
);
console.log(
  await packageMac({
    root,
    template: process.argv[2] ? resolve(process.argv[2]) : electronTemplate(require("electron")),
    destination: process.env.WANX_BUILDER_RELEASE_DIR ? resolve(process.env.WANX_BUILDER_RELEASE_DIR) : resolve(root, "release"),
    product,
  }),
);

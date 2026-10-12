import * as nodeFileSystem from "node:fs/promises";
import { createRequire } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join, resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import { validateDefinition, canonicalDefinition } from "./definition.mjs";
const run = promisify(execFile);
// Electron's patched fs interprets .asar as a virtual directory. Packaging must
// copy/remove the archive itself, including when it is absent in a signed template.
const { cp, mkdir, readFile, writeFile, rm, access } = process.versions.electron
  ? createRequire(import.meta.url)("original-fs").promises
  : nodeFileSystem;
export async function packageMac({
  root,
  template,
  destination,
  product,
  definition,
  sign = true,
}) {
  if (process.platform !== "darwin" || process.arch !== "arm64")
    throw new Error("MAC_ARM64_REQUIRED");
  const def = definition ? validateDefinition(definition) : null;
  const appId = def?.applicationId ?? product.applicationId;
  if (!/^[a-z][a-z0-9.-]{2,63}$/.test(appId))
    throw new Error("INVALID_APPLICATION_ID");
  const name = def?.name ?? product.name;
  const version = def?.version ?? product.version;
  const output = join(resolve(destination), `${appId}-${version}.app`);
  await access(join(root, "dist-ui/index.html"));
  await mkdir(destination, { recursive: true });
  try {
    await access(output);
    throw new Error("ARTIFACT_ALREADY_EXISTS");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  try {
    // macOS clone-on-write keeps the Electron runtime economical without runtime links.
    try {
      await run("/bin/cp", ["-cR", template, output]);
    } catch (error) {
      if (
        !/cross-device|not supported|invalid argument/i.test(
          String(error.stderr || error.message),
        )
      )
        throw error;
      await rm(output, { recursive: true, force: true });
      await run("/bin/cp", ["-R", template, output]);
    }
    const contents = join(output, "Contents");
    const target = join(contents, "Resources/app");
    await rm(target, { recursive: true, force: true });
    await mkdir(target, { recursive: true });
    for (const path of ["shell", "core", "dist-ui", "vendor"])
      await cp(join(root, path), join(target, path), {
        recursive: true,
        dereference: true,
      });
    for (const module of ["centaurai-wanx", "ws", "bonjour-service", "@leichtgewicht/ip-codec", "dns-packet", "fast-deep-equal", "multicast-dns", "thunky"]) {
      let source = join(root, "node_modules", module);
      try { await access(source); } catch (error) {
        if (error.code !== "ENOENT") throw error;
        source = join(root, "vendor/node_modules", module);
      }
      await cp(
        source,
        join(target, "node_modules", module),
        { recursive: true, dereference: true },
      );
    }
    const config = {
      kind: def ? "application" : "builder",
      applicationId: appId,
      name,
      version,
      ...(def ? { definition: def } : {}),
    };
    await writeFile(
      join(target, "product.json"),
      JSON.stringify(config, null, 2),
    );
    await writeFile(
      join(target, "package.json"),
      JSON.stringify({
        name: appId,
        productName: name,
        version,
        type: "module",
        main: "shell/main.mjs",
      }),
    );
    for (const file of ["LICENSE", "THIRD_PARTY_NOTICES.md"])
      await cp(join(root, file), join(target, file)).catch(() => {});
    await rm(join(contents, "Resources/default_app.asar"), { force: true });
    await rm(join(contents, "Resources/app.asar"), { force: true });
    const plist = join(contents, "Info.plist");
    for (const [key, value] of Object.entries({
      CFBundleIdentifier: `ai.centaurai.${appId}`,
      CFBundleName: name,
      CFBundleDisplayName: name,
      CFBundleShortVersionString: version,
      CFBundleVersion: version,
      NSMicrophoneUsageDescription: "在你使用语音输入时访问麦克风。",
    })) {
      await run("/usr/bin/plutil", ["-replace", key, "-string", value, plist]);
    }
    // Remove inherited Finder/resource forks only from this newly built bundle.
    for (const attribute of [
      "com.apple.FinderInfo",
      "com.apple.ResourceFork",
    ]) {
      await run("/usr/bin/xattr", ["-dr", attribute, output]).catch(() => {});
    }
    if (sign) {
      await run("/usr/bin/codesign", ["--force", "--sign", "-", output], {
        timeout: 120000,
      });
      try {
        await run("/usr/bin/codesign", ["--verify", "--deep", output], {
          timeout: 30000,
        });
      } catch {
        // A raw Electron development distribution may have incomplete nested
        // resource seals. Seal this new bundle once; subsequent Builder builds
        // reuse those valid runtime signatures and keep clone-on-write sharing.
        await run(
          "/usr/bin/codesign",
          ["--force", "--deep", "--sign", "-", output],
          { timeout: 120000 },
        );
        await run("/usr/bin/codesign", ["--verify", "--deep", output], {
          timeout: 30000,
        });
      }
    }
    const definitionHash = createHash("sha256")
      .update(def ? canonicalDefinition(def) : JSON.stringify(config))
      .digest("hex");
    const receipt = {
      applicationId: appId,
      version,
      path: output,
      definitionHash,
      builtAt: new Date().toISOString(),
      platform: "macos",
      arch: "arm64",
      signature: sign ? "ad-hoc" : "none",
      notarized: false,
      installationVerified: false,
      artifactSha256: createHash("sha256")
        .update(
          await readFile(
            sign
              ? join(contents, "_CodeSignature/CodeResources")
              : join(target, "product.json"),
          ),
        )
        .digest("hex"),
      artifactHashKind: sign
        ? "macos-code-resources"
        : "unsigned-product-manifest",
    };
    await writeFile(output + ".receipt.json", JSON.stringify(receipt, null, 2));
    return receipt;
  } catch (error) {
    await rm(output, { recursive: true, force: true });
    throw error;
  }
}
export async function verifyMacReceipt(receipt) {
  try {
    await access(receipt.path);
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
  const product = JSON.parse(
    await readFile(
      join(receipt.path, "Contents/Resources/app/product.json"),
      "utf8",
    ),
  );
  if (
    product.applicationId !== receipt.applicationId ||
    product.version !== receipt.version ||
    createHash("sha256")
      .update(canonicalDefinition(product.definition))
      .digest("hex") !== receipt.definitionHash
  )
    throw new Error("ARTIFACT_DEFINITION_CHANGED");
  await run("/usr/bin/codesign", ["--verify", "--deep", receipt.path], {
    timeout: 30000,
  });
  const seal = createHash("sha256")
    .update(
      await readFile(
        join(receipt.path, "Contents/_CodeSignature/CodeResources"),
      ),
    )
    .digest("hex");
  if (seal !== receipt.artifactSha256)
    throw new Error("ARTIFACT_SIGNATURE_CHANGED");
  return true;
}
export function electronTemplate(executable) {
  return resolve(dirname(executable), "../..");
}

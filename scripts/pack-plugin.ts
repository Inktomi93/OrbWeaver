// Pack a plugin source directory into an installable bundle — `pnpm plugin:pack <slug> [outDir]`.
//
// A bundle is a zip of EXACTLY `manifest.json` + `main.js` (`domain/plugin/substrate/manifest.ts` refuses a
// third entry, an over-cap entry, or a manifest that fails `pluginManifestSchema`). This script exists so a
// plugin author can produce that zip without owning a build pipeline, and so the SAME packer the per-user
// seeder uses produces the file you hand someone — one function, `packSeedPluginBundle`, no second spelling
// that could drift from what actually gets installed.
//
// It validates before it writes: a bundle that would be refused at install is refused HERE, with the same
// message, rather than at the far end of someone else's upload.
//
//   pnpm plugin:pack oracle-deck              → ./oracle-deck-1.0.0.zip
//   pnpm plugin:pack oracle-deck /tmp/out     → /tmp/out/oracle-deck-1.0.0.zip

import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";
import { pluginManifestSchema } from "@orb/contracts/plugin";
import { unzipSync } from "fflate";
import { packSeedPluginBundle } from "../packages/server/src/entry/boot/seed-assets/index.ts";

const USAGE = "usage: pnpm plugin:pack <slug> [outDir]\n  <slug> is a directory under packages/server/src/entry/boot/seed-assets/plugins/";

/** Exit codes match the repo's verification contract: 1 = the input is bad, 3 = the invocation is bad. */
const EXIT_VIOLATION = 1;
const EXIT_MISUSE = 3;

function die(message: string, code: number): never {
  process.stderr.write(`${message}\n`);
  process.exit(code);
}

async function main(): Promise<void> {
  const [slug, outDir] = process.argv.slice(2);
  if (slug === undefined || slug.length === 0) {
    die(USAGE, EXIT_MISUSE);
  }

  const bundle = await packSeedPluginBundle(slug);
  if (bundle === null) {
    die(`plugin:pack: no source directory for "${slug}" (expected manifest.json + main.js)\n${USAGE}`, EXIT_VIOLATION);
  }

  // Re-read what we just packed and validate it the way the install verb will. Packing an invalid manifest
  // and finding out at the far end of an upload is exactly the loop this closes.
  const entries = unzipSync(bundle);
  const parsed = pluginManifestSchema.safeParse(JSON.parse(new TextDecoder().decode(entries["manifest.json"])));
  if (!parsed.success) {
    die(`plugin:pack: ${slug}/manifest.json is not a valid plugin manifest\n${JSON.stringify(parsed.error.issues, null, 2)}`, EXIT_VIOLATION);
  }

  const dir = resolve(outDir ?? ".");
  await mkdir(dir, { recursive: true });
  const outPath = join(dir, `${parsed.data.id}-${parsed.data.version}.zip`);
  await writeFile(outPath, bundle);
  process.stdout.write(`packed ${outPath} (${bundle.byteLength} bytes, capabilities: ${parsed.data.capabilities.join(", ") || "none"})\n`);
}

await main();

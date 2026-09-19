// Pack a plugin source directory into an installable bundle — `pnpm plugin:pack <slug> [outDir]`.
//
// A bundle is a zip of `manifest.json` + `main.js` — plus `ui.js` when the manifest declares `uiEntry`, plus
// any `ui/assets/<name>` images (#820). `domain/plugin/substrate/manifest.ts` owns that contract and refuses
// any OTHER entry, an over-cap or over-count entry, a manifest that fails `pluginManifestSchema`, a
// non-image asset, or a `ui.js` whose presence disagrees with `uiEntry` in either direction. This
// script exists so a plugin author can produce that zip without owning a build pipeline, and so the SAME
// packer the per-user seeder uses produces the file you hand someone — one function, `packShowcaseBundle`
// (`@orb/showcase-plugins`, #1692), no second spelling that could drift from what actually gets installed.
//
// It validates before it writes, THROUGH THE INSTALL FUNNEL ITSELF (#1908): the packed bytes go to
// `parseBundle` — the same function `install`, `upgrade`, `installFromUrl` and `activate` run — so a bundle
// that would be refused at install is refused HERE, with the same message, rather than at the far end of
// someone else's upload. Until #1908 this line was a WISH: the check was a bare `unzipSync` plus
// `pluginManifestSchema` on `manifest.json` alone, which passes everything the funnel's other walls refuse
// (a forbidden or over-cap entry, and either direction of the `ui.js` ⟺ `uiEntry` biconditional — and
// `packShowcaseBundle` packs `ui.js` whenever it exists on disk, deliberately validating nothing, so the
// undeclared-`ui.js` arm was reachable from an ordinary source directory). One funnel, no second cap set.
//
//   pnpm plugin:pack oracle-deck              → ./oracle-deck-1.0.0.zip
//   pnpm plugin:pack oracle-deck /tmp/out     → /tmp/out/oracle-deck-1.0.0.zip

import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";
import type { PluginManifest } from "@orb/contracts/plugin";
import { ManifestInvalidError, parseBundle } from "@orb/server/domain/plugin";
import { packShowcaseBundle } from "@orb/showcase-plugins";

const USAGE = "usage: pnpm plugin:pack <slug> [outDir]\n  <slug> is a directory under packages/showcase-plugins/bundles/";

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

  const bundle = await packShowcaseBundle(slug);
  if (bundle === null) {
    die(`plugin:pack: no source directory for "${slug}" (expected manifest.json + main.js)\n${USAGE}`, EXIT_VIOLATION);
  }

  // Re-read what we just packed and validate it the way the install verb will — THE SAME FUNCTION, not a
  // second spelling of its rules. Packing a bundle the funnel refuses and finding out at the far end of an
  // upload is exactly the loop this closes.
  let manifest: PluginManifest;
  try {
    manifest = parseBundle(bundle).manifest;
  } catch (err) {
    // The typed refusal is the WHOLE reason this runs here: its message is verbatim what the installer
    // would have told the person you handed the zip to. Anything else is a packer defect and rethrows —
    // swallowing it would be how a broken packer starts reporting "invalid bundle" for years.
    if (err instanceof ManifestInvalidError) {
      die(`plugin:pack: ${slug} does not pack to an installable bundle\n${err.message}`, EXIT_VIOLATION);
    }
    throw err;
  }

  const dir = resolve(outDir ?? ".");
  await mkdir(dir, { recursive: true });
  const outPath = join(dir, `${manifest.id}-${manifest.version}.zip`);
  await writeFile(outPath, bundle);
  process.stdout.write(`packed ${outPath} (${bundle.byteLength} bytes, capabilities: ${manifest.capabilities.join(", ") || "none"})\n`);
}

await main();

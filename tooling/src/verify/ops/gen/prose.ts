// Generator for `packages/contracts/src/prose/prose-baseline.json` — the committed version↔hash manifest the
// PROSE-1 §4.4 upgrade story rests on (`pnpm prose:baseline`). One row per slot: `{ version, sha256(text) }`.
//
// The manifest is what makes "bump the version when you change the text" a MECHANISM instead of a discipline:
//   • this generator REFUSES to write when a slot's text changed while its `version` stayed put;
//   • the sibling contract test (`tests/contracts/prose/index.contract.test.ts`) REDs on the same condition
//     against the COMMITTED manifest, so an unbumped revision cannot reach a green tree even if nobody runs
//     this script.
// Together: a host's stored `baseVersion` is a trustworthy staleness signal, and a revised default never
// lands behind a host's back.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { PROSE_SLOT_IDS, PROSE_SLOTS } from "@orb/contracts/prose";
import { EXIT } from "@orb/tooling/_shared/exit-contract";

/** The `baseline prose` verb — the SINGLE writer of its committed baseline (GATE-AUTHORING §4.8). */
export function generateProseBaseline(root: string): number {
  const ManifestPath = join(root, "packages/contracts/src/prose/prose-baseline.json");

  interface BaselineRow {
    readonly version: number;
    readonly sha256: string;
  }

  const sha256 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

  function readCommitted(): Record<string, BaselineRow> {
    try {
      const parsed: unknown = JSON.parse(readFileSync(ManifestPath, "utf8"));
      const slots = (parsed as { slots?: unknown }).slots;
      return typeof slots === "object" && slots !== null ? (slots as Record<string, BaselineRow>) : {};
    } catch {
      // First run — no manifest yet.
      return {};
    }
  }

  const committed = readCommitted();
  const unbumped: string[] = [];
  const slots: Record<string, BaselineRow> = {};

  for (const id of PROSE_SLOT_IDS) {
    const slot = PROSE_SLOTS[id];
    const hash = sha256(slot.text);
    const prior = committed[id];
    if (prior !== undefined && prior.sha256 !== hash && prior.version >= slot.version) {
      unbumped.push(`${id} (text changed, version still ${slot.version})`);
    }
    slots[id] = { version: slot.version, sha256: hash };
  }

  if (unbumped.length > 0) {
    process.stderr.write(`prose:baseline REFUSED — bump \`version\` in the SAME commit as the text change:\n  ${unbumped.join("\n  ")}\n`);
    return EXIT.violations;
  }

  writeFileSync(ManifestPath, `${JSON.stringify({ slots }, null, 2)}\n`);
  process.stdout.write(`wrote ${PROSE_SLOT_IDS.length} prose slots → ${ManifestPath}\n`);
  return EXIT.clean;
}

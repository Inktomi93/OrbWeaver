// `pnpm doc migrate-ledger --range <a-b|all> [--apply]`: split rulings out of the legacy registry into
// one ADR file each, ids kept. Dry run by default: it names every file it would write and every refusal.
// `--apply` writes the ADRs, removes the rows from the registry and regenerates the indexes, in that
// order, so a failed write leaves the registry intact. A batch is one lane's worth; `all` is the
// single-commit form.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DOC_TOOL_TREES } from "#doc-catalog";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { Ruling, RulingRange } from "../contract/types.ts";
import { adrSlug, parseRegistry, renderAdr, withoutRulings } from "../lib/ledger.ts";
import { numberedName } from "../lib/names.ts";
import { regenerateIndexes } from "./indexes.ts";
import type { WriteOutcome } from "./items.ts";
import { root, today, writeDoc } from "./tree.ts";

refuseDirectInvocation(import.meta.url, "pnpm doc migrate-ledger --range <a-b|all> [--apply]");

export const REGISTRY_PATH = "docs/architecture/core/Core-Path-Registry.md";

export interface MigrationPlan {
  readonly writes: readonly { readonly ruling: Ruling; readonly path: string }[];
  readonly refusals: readonly string[];
}

/** What the batch would do, from the registry's own text. Pure over the source so a test plants one. */
export function planMigration(source: string, range: RulingRange | "all", existingAdrs: ReadonlySet<string>): MigrationPlan {
  const parsed = parseRegistry(source);
  const refusals = parsed.duplicates.map((id) => `D${String(id)}: anchored more than once in ${REGISTRY_PATH} — merge the rows before migrating`);
  const selected = parsed.rulings.filter((ruling) => range === "all" || (ruling.id >= range.lo && ruling.id <= range.hi));
  if (selected.length === 0) {
    refusals.push(`no ruling in range ${range === "all" ? "all" : `${String(range.lo)}-${String(range.hi)}`}`);
  }
  const writes = selected.map((ruling) => ({ ruling, path: `${DOC_TOOL_TREES.adr}${numberedName(ruling.id, adrSlug(ruling))}` }));
  for (const write of writes) {
    if (existingAdrs.has(write.path)) {
      refusals.push(`${write.path}: exists`);
    }
  }
  return { writes, refusals };
}

export function migrateLedger(
  range: RulingRange | "all",
  apply: boolean,
  repoRoot = root,
  date = today(),
): WriteOutcome & { readonly planned: readonly string[] } {
  const abs = join(repoRoot, REGISTRY_PATH);
  if (!existsSync(abs)) {
    return { written: [], refusals: [`${REGISTRY_PATH}: gone — the ledger has migrated`], planned: [] };
  }
  const source = readFileSync(abs, "utf8");
  const existing = new Set(readdirAdrs(repoRoot));
  const plan = planMigration(source, range, existing);
  const planned = plan.writes.map((write) => `D${String(write.ruling.id)} → ${write.path}`);
  if (plan.refusals.length > 0 || !apply) {
    return { written: [], refusals: plan.refusals, planned };
  }
  for (const write of plan.writes) {
    writeDoc(write.path, renderAdr(write.ruling, date), repoRoot);
  }
  writeDoc(REGISTRY_PATH, withoutRulings(source, new Set(plan.writes.map((write) => write.ruling.id))), repoRoot);
  return { written: [...plan.writes.map((write) => write.path), REGISTRY_PATH, ...regenerateIndexes(repoRoot)], refusals: [], planned };
}

function readdirAdrs(repoRoot: string): readonly string[] {
  const dir = join(repoRoot, DOC_TOOL_TREES.adr);
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir).map((name) => `${DOC_TOOL_TREES.adr}${name}`);
}

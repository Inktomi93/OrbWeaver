// ui-facts: a read-only census of hand-rolled UI over the client and ui sources. A report: no gate, no baseline.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { EXIT } from "../floor/cli/exit-contract.ts";
import { UsageError } from "../floor/cli/run-tool.ts";
import { analyse } from "./analysis.ts";
import { loadExceptions } from "./exceptions.ts";
import type { Hit } from "./hand-model.ts";
import { HAND_ROLLING_PART } from "./hand-model.ts";
import type { MigrationPlan } from "./migration.ts";
import { isDeclaredOwner, isMigratableOwner, planOwner, proveOwner, rankedRows, readPlan, readSkips, writePlan } from "./migration.ts";
import { renderReport } from "./report.ts";
import { loadSources } from "./source.ts";
import type { ComponentTables } from "./variant-tables.ts";
import { componentTables } from "./variant-tables.ts";

export { sidecarsOf } from "./migration.ts";
export { checkRewrite } from "./recipe-check.ts";

const OUT_DIR = "reports/ui-facts";
const FLAGS = ["--only", "--out", "--root", "--plan", "--prove", "--map"] as const;
const REPORT_PARTS: readonly string[] = [HAND_ROLLING_PART];

interface Args {
  /** The sections to select, or null for the whole client. */
  readonly only: readonly string[] | null;
  /** Report parts to print alone, named in `--only` beside sections. */
  readonly parts: readonly string[];
  readonly out: string;
  readonly root: string;
  /** An owner to write a migration plan for, or to prove after its rewrite; both need the plan's map file. */
  readonly migration: { readonly mode: "plan" | "prove"; readonly owner: string; readonly map: string } | null;
}

function flag(argv: readonly string[], name: (typeof FLAGS)[number]): string | null {
  const hit = argv.find((arg) => arg.startsWith(`${name}=`));
  return hit === undefined ? null : hit.slice(name.length + 1);
}

export function parseArgs(argv: readonly string[]): Args {
  const unknown = argv.filter((arg) => !FLAGS.some((name) => arg.startsWith(`${name}=`)));
  if (unknown.length > 0) {
    throw new UsageError(`unknown argument ${unknown.join(" ")}; flags: ${FLAGS.map((name) => `${name}=<value>`).join(" ")}`);
  }
  const names =
    flag(argv, "--only")
      ?.split(",")
      .filter((name) => name !== "") ?? [];
  const sections = names.filter((name) => !REPORT_PARTS.includes(name));
  const plan = flag(argv, "--plan");
  const prove = flag(argv, "--prove");
  const owner = plan ?? prove;
  const map = flag(argv, "--map");
  if (plan !== null && prove !== null) {
    throw new UsageError("--plan and --prove are separate runs");
  }
  if (owner !== null && (!isMigratableOwner(owner) || map === null)) {
    throw new UsageError("--plan and --prove take a `component.axis` owner such as row.justify, and the plan's --map=<file>");
  }
  return {
    migration: owner === null || map === null ? null : { mode: plan === null ? "prove" : "plan", owner, map },
    only: sections.length === 0 ? null : sections,
    parts: names.filter((name) => REPORT_PARTS.includes(name)),
    out: flag(argv, "--out") ?? OUT_DIR,
    root: flag(argv, "--root") ?? process.cwd(),
  };
}

export function runUiFacts(argv: readonly string[]): number {
  const args = parseArgs(argv);
  const facts = analyse(args.root, loadExceptions(args.root), args.only);
  const dir = join(args.root, args.out);
  mkdirSync(dir, { recursive: true });
  const command = `pnpm ui-facts${argv.length === 0 ? "" : ` ${argv.join(" ")}`}`;
  writeFileSync(join(dir, "ui-facts.json"), `${JSON.stringify(facts, null, 2)}\n`);
  writeFileSync(join(dir, "ui-facts.md"), `${renderReport(facts, command, args.parts)}\n`);
  const scanned = facts.scanned;
  process.stdout.write(
    `ui-facts: scanned ${scanned.total} files (${scanned.ts} ts, ${scanned.tsx} tsx, ${scanned.css} css), ${facts.sites.length} sites, wrote ${args.out}/ui-facts.{json,md}\n`,
  );
  return args.migration === null ? EXIT.clean : runMigration(args.root, args.migration, facts.handRolling);
}

/** A plan of nothing is clean only for a real owner with no rows left; any other empty plan names what stopped it and fails. */
function emptyPlanExit(owner: string, plan: MigrationPlan, hits: readonly Hit[], tables: ComponentTables): number {
  const ranked = rankedRows(hits, owner);
  if (ranked.length === 0 && isDeclaredOwner(owner, tables)) {
    process.stdout.write(`ui-facts: ${owner} has no rows left to migrate\n`);
    return EXIT.clean;
  }
  if (ranked.length === 0) {
    process.stdout.write(`ui-facts: no component forwards an axis named ${owner}, and the census ranks no row under it\n`);
    return EXIT.violations;
  }
  process.stdout.write(`ui-facts: the census ranks ${ranked.length} rows under ${owner} and the plan can move none of them\n`);
  for (const { path, line, token, reason } of plan.review) {
    process.stdout.write(`  review: ${path}:${line} ${token}: ${reason}\n`);
  }
  for (const { path, line, detail, owner: rowOwner } of ranked.filter((hit) => hit.owner !== owner)) {
    process.stdout.write(`  ${rowOwner}: ${path}:${line} ${detail}\n`);
  }
  return EXIT.violations;
}

/** Write the plan for one owner, or prove it against the census that was just rerun. */
function runMigration(root: string, { mode, owner, map }: NonNullable<Args["migration"]>, hits: readonly Hit[]): number {
  if (mode === "plan") {
    const tables = componentTables(root, loadSources(root));
    const plan = planOwner(hits, tables, owner);
    writePlan(root, map, plan);
    const files = new Set(plan.sites.map((site) => site.path)).size;
    process.stdout.write(`ui-facts: planned ${owner}: ${plan.sites.length} sites in ${files} files, ${plan.review.length} for review, wrote ${map}\n`);
    return plan.sites.length === 0 ? emptyPlanExit(owner, plan, hits, tables) : EXIT.clean;
  }
  const skips = readSkips(root, map);
  const proof = proveOwner(readPlan(root, map), hits, skips);
  process.stdout.write(
    `ui-facts: proved ${owner}: planned ${proof.planned}, review ${proof.review}, codemod skips ${skips.length}, ${proof.remaining.length} remain, ${proof.unexplained.length} without a reason\n`,
  );
  for (const hit of proof.unexplained) {
    process.stdout.write(`  no reason: ${hit.path}:${hit.line} ${hit.detail}\n`);
  }
  return proof.unexplained.length === 0 ? EXIT.clean : EXIT.violations;
}

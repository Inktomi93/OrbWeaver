import process from "node:process";
import { parseArgs } from "node:util";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { UsageError } from "@orb/tooling/_shared/run-tool";
import type { TypecheckPlanMode } from "../contract/typecheck-plan.ts";
import { readPolicyRepositoryInventory, resolveExistingPolicyPath } from "../lib/policy-repo-inventory.ts";
import { planTypecheckPrograms } from "../lib/program-routing.ts";

export const TYPECHECK_PLAN_HELP =
  "usage: pnpm exec node tooling/src/verify/cli.ts typecheck-plan (--primary|--affected) --file <repo-relative paths...> [--json]";

function parseMode(primary: boolean | undefined, affected: boolean | undefined): TypecheckPlanMode {
  if (primary === affected) {
    throw new UsageError("typecheck-plan requires exactly one of --primary or --affected");
  }
  return primary === true ? "primary" : "affected";
}

export function runTypecheckPlan(root: string, args: readonly string[]): number {
  let values: { readonly primary?: boolean; readonly affected?: boolean; readonly file?: boolean; readonly json?: boolean };
  let positionals: readonly string[];
  try {
    const parsed = parseArgs({
      args: [...args],
      allowPositionals: true,
      strict: true,
      options: {
        primary: { type: "boolean" },
        affected: { type: "boolean" },
        file: { type: "boolean" },
        json: { type: "boolean" },
      },
    });
    values = parsed.values;
    positionals = parsed.positionals;
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error), { cause: error });
  }
  if (values.file !== true || positionals.length === 0) {
    throw new UsageError("typecheck-plan requires --file followed by at least one path");
  }
  const mode = parseMode(values.primary, values.affected);
  const inventory = readPolicyRepositoryInventory(root);
  let paths: readonly string[];
  try {
    paths = positionals.map((path) => resolveExistingPolicyPath(inventory, path, "file"));
  } catch (error) {
    throw new UsageError(error instanceof Error ? error.message : String(error), { cause: error });
  }
  const plan = planTypecheckPrograms(
    root,
    paths.map((path) => ({ path, status: "present", previousPath: null })),
    mode,
  );
  if (values.json === true) {
    process.stdout.write(`${JSON.stringify(plan)}\n`);
    return EXIT.clean;
  }
  process.stdout.write(`typecheck plan: ${plan.coverage}\n`);
  for (const subject of plan.subjects) {
    process.stdout.write(`  ${subject.path}: ${subject.disposition} -> {${subject.selectedPrograms.join(", ")}} (${subject.reason})\n`);
  }
  return EXIT.clean;
}

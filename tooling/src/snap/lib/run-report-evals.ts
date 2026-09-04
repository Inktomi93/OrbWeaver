// The eval arm's VALUES, read back browser-free (seam with lane p-snap-receipts, 2026-09-04).
//
// `--report --arm eval` could name the artifact and never say what the expression evaluated to, which is
// the one thing an `--eval` run exists to produce. The arm now writes `evidence/evals.json`
// (`snap-eval-values-v1`); this reads it STRUCTURALLY — the artifact is resolved from the eval fact's own
// `artifacts` list in run.json, never by guessing a filename, because a scenario checkpoint writes
// `<checkpoint>-evals.json`.
//
// AN ARM THAT MEASURED NOTHING WRITES NO FILE. A missing artifact is "nothing measured" and prints
// nothing; a PRESENT file that will not parse is an instrument defect and says so.
import { readFile } from "node:fs/promises";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { SnapRunIndex } from "../contract/run-index.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --report <index> --arm eval");

/** One expression's outcome. `value` XOR `error`: a row carrying both, or neither, is malformed. */
export interface SnapEvalValue {
  readonly page: number;
  readonly expression: string;
  readonly value: string | null;
  readonly error: string | null;
}

function evalRow(value: unknown): SnapEvalValue | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const page = Reflect.get(value, "page");
  const expression = Reflect.get(value, "expression");
  const text = Reflect.get(value, "value");
  const error = Reflect.get(value, "error");
  const exclusive = (typeof text === "string") !== (typeof error === "string");
  if (!(Number.isInteger(page) && typeof expression === "string" && exclusive)) {
    return null;
  }
  return {
    page: Number(page),
    expression,
    value: typeof text === "string" ? text : null,
    error: typeof error === "string" ? error : null,
  };
}

/** The artifacts the EVAL FACT itself points at — the binding run-bundle made by `producerArm`. */
export function evalArtifactPaths(index: SnapRunIndex): readonly string[] {
  const refs = new Set(
    index.results?.batches
      .flatMap((batch) => batch.arms)
      .filter((fact) => fact.arm === "eval")
      .flatMap((fact) => fact.artifacts) ?? [],
  );
  return index.artifacts.filter((artifact) => refs.has(artifact.relativePath) || artifact.producerArm === "eval").map((artifact) => artifact.path);
}

export async function readSnapEvalValues(path: string): Promise<readonly SnapEvalValue[]> {
  const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
  const rows = typeof parsed === "object" && parsed !== null ? Reflect.get(parsed, "evals") : undefined;
  if (!Array.isArray(rows)) {
    throw new Error(`${path} is not snap-eval-values-v1 (no eval population)`);
  }
  return rows.map((row) => {
    const parsedRow = evalRow(row);
    if (parsedRow === null) {
      throw new Error(`${path} has a malformed eval row (value XOR error)`);
    }
    return parsedRow;
  });
}

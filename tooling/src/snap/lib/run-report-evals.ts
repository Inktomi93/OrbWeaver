// Resolve eval artifacts from their arm references, including scenario checkpoint files.
// A present malformed artifact is an instrument failure, not an empty measurement.
import { readFile } from "node:fs/promises";
import { refuseDirectInvocation } from "../../floor/cli/entrypoint.ts";
import type { SnapRunIndex } from "../contract/run-index.ts";
import type { SnapEvalValue } from "../contract/types.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --report <index> --arm eval");

function evalRow(value: unknown): SnapEvalValue | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const page = Reflect.get(value, "page");
  const expression = Reflect.get(value, "expression");
  const text = Reflect.get(value, "value");
  const error = Reflect.get(value, "error");
  if (!Number.isInteger(page) || typeof expression !== "string") {
    return null;
  }
  const identity = { page: Number(page), expression };
  if (typeof text === "string" && typeof error !== "string") {
    return { ...identity, value: text, error: null };
  }
  if (typeof error === "string" && typeof text !== "string") {
    return { ...identity, value: null, error };
  }
  return null;
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

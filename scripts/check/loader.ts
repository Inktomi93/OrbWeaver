// Fail-closed auto-loader: a gate module that exports `gate: GateDescriptor` is discovered from the
// gates dir — the loader IS the registry. A discovered module whose export isn't a valid descriptor is a
// hard error at load; "valid" includes the self-proof (≥1 mustFlag + ≥1 mustPass), so an un-proven gate
// cannot register. Deterministic order: sorted repo-relative path.
import { globSync } from "node:fs";
import { pathToFileURL } from "node:url";
import type { GateDescriptor } from "./contract.ts";

const D_TS_RE = /\.d\.ts$/u;
const BASENAME_RE = /([^/]+)\.ts$/u;

function nonEmptyArray(v: unknown): boolean {
  return Array.isArray(v) && v.length > 0;
}

/** The metadata arm of the shape check (name/docRow/status/scopeSafety). */
function assertMeta(g: Record<string, unknown>, rel: string): void {
  const base = BASENAME_RE.exec(rel)?.[1];
  if (typeof g["name"] !== "string" || g["name"] !== base) {
    throw new Error(
      `gate ${rel}: descriptor.name (${String(g["name"])}) must equal the filename (${base})`,
    );
  }
  if (typeof g["docRow"] !== "string" || g["docRow"].length === 0) {
    throw new Error(`gate ${rel}: descriptor.docRow (the enforcement-doc citation) is required`);
  }
  if (typeof g["message"] !== "string" || g["message"].length === 0) {
    throw new Error(
      `gate ${rel}: descriptor.message (the reason, printed once per group) is required`,
    );
  }
  if (g["status"] !== "active" && g["status"] !== "dormant") {
    throw new Error(`gate ${rel}: descriptor.status must be "active" | "dormant"`);
  }
  if (g["scopeSafety"] !== "incremental-safe" && g["scopeSafety"] !== "whole-project") {
    throw new Error(
      `gate ${rel}: descriptor.scopeSafety must be "incremental-safe" | "whole-project"`,
    );
  }
}

/** The behavior + self-proof arm of the shape check (a visit/visitFile/run family + mustFlag/mustPass). */
function assertBehavior(g: Record<string, unknown>, rel: string): void {
  const hasVisit = typeof g["visit"] === "function";
  if (hasVisit && !nonEmptyArray(g["kinds"])) {
    throw new Error(
      `gate ${rel}: a \`visit\` gate must declare a non-empty \`kinds\` subscription`,
    );
  }
  if (!hasVisit && typeof g["run"] !== "function" && typeof g["visitFile"] !== "function") {
    throw new Error(`gate ${rel}: a descriptor must have at least one of visit / visitFile / run`);
  }
  if (!nonEmptyArray(g["mustFlag"])) {
    throw new Error(`gate ${rel}: descriptor.mustFlag needs ≥1 self-proof example (§1.6)`);
  }
  if (!nonEmptyArray(g["mustPass"])) {
    throw new Error(
      `gate ${rel}: descriptor.mustPass needs ≥1 false-positive-guard example (§1.6)`,
    );
  }
}

/** Runtime shape check (tsx runs type-stripped, so this is the enforcement that actually fires). */
function assertDescriptor(gate: unknown, rel: string): asserts gate is GateDescriptor {
  if (gate === undefined || gate === null || typeof gate !== "object") {
    throw new Error(`gate module ${rel} does not export a \`gate\` descriptor object`);
  }
  const g = gate as Record<string, unknown>;
  assertMeta(g, rel);
  assertBehavior(g, rel);
}

/** Discover every contract-form gate in the gates dir, sorted by path, with fail-closed validation. */
export async function loadGates(root: string): Promise<readonly GateDescriptor[]> {
  const files = globSync("scripts/check/gates/*.ts", { cwd: root })
    .filter((f) => !D_TS_RE.test(f))
    .sort();
  const gates: GateDescriptor[] = [];
  const seen = new Set<string>();
  for (const rel of files) {
    // Sequential-deterministic: a load/parse failure must attribute to its file, in sorted order — never
    // a Promise.all race that loses which module threw.
    // biome-ignore lint/performance/noAwaitInLoops: deterministic per-file attribution is the requirement.
    const mod = (await import(pathToFileURL(`${root}/${rel}`).href)) as { gate?: unknown };
    if (mod.gate === undefined) {
      continue; // not yet ported to the contract
    }
    assertDescriptor(mod.gate, rel);
    if (seen.has(mod.gate.name)) {
      throw new Error(`duplicate gate name ${mod.gate.name} (${rel})`);
    }
    seen.add(mod.gate.name);
    gates.push(mod.gate);
  }
  return gates;
}

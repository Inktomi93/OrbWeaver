// Deterministic fail-closed loader for the final defineGate-only descriptor corpus.
import { globSync } from "node:fs";
import { pathToFileURL } from "node:url";
import type { GatePolicy } from "../contract/policy.ts";
import { isDefinedGatePolicy } from "../contract/policy.ts";
import { assertGatePolicyDescriptor } from "./policy-validation.ts";

const DECLARATION_RE = /\.d\.ts$/u;
const BASENAME_RE = /([^/]+)\.ts$/u;

interface ImportedPolicy {
  readonly gate: GatePolicy;
  readonly rel: string;
}

export interface GatePolicyCorpus {
  readonly gates: readonly GatePolicy[];
  readonly files: readonly string[];
  /** Derived from loaded descriptors; singleton families need no registry row. */
  readonly families: readonly string[];
}

function descriptorExports(module: Record<string, unknown>): readonly [string, GatePolicy][] {
  return Object.entries(module).filter((entry): entry is [string, GatePolicy] => isDefinedGatePolicy(entry[1]));
}

async function importPolicy(root: string, rel: string): Promise<ImportedPolicy> {
  const module = (await import(pathToFileURL(`${root}/${rel}`).href)) as Record<string, unknown>;
  const descriptors = descriptorExports(module);
  if (descriptors.length === 0 || module["gate"] === undefined) {
    throw new Error(`gate module ${rel} must export exactly one \`gate\` created by defineGate`);
  }
  if (descriptors.length !== 1 || descriptors[0]?.[0] !== "gate") {
    throw new Error(`gate module ${rel} must export exactly one defineGate descriptor named \`gate\`; found ${descriptors.length}`);
  }
  const gate = module["gate"];
  if (!isDefinedGatePolicy(gate)) {
    throw new Error(`gate module ${rel} exports a descriptor that was not created by defineGate`);
  }
  try {
    assertGatePolicyDescriptor(gate);
  } catch (error) {
    throw new Error(`gate module ${rel}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
  return { gate, rel };
}

function assertUniqueIds(imported: readonly ImportedPolicy[]): void {
  const groups = Map.groupBy(imported, ({ gate }) => gate.id);
  for (const [id, rows] of [...groups].toSorted(([left], [right]) => left.localeCompare(right))) {
    if (rows.length > 1) {
      throw new Error(`duplicate gate policy id ${id}: ${rows.map(({ rel }) => rel).join(", ")}`);
    }
  }
}

function assertFilenameIds(imported: readonly ImportedPolicy[]): void {
  for (const { gate, rel } of imported) {
    const basename = BASENAME_RE.exec(rel)?.[1];
    if (basename === undefined || gate.id !== basename) {
      throw new Error(`gate module ${rel}: descriptor.id (${gate.id}) must equal the filename (${String(basename)})`);
    }
  }
}

/** Auto-discover and import every corpus module. Today's legacy corpus intentionally fails this door. */
export async function loadPolicyCorpus(root: string): Promise<GatePolicyCorpus> {
  const files = globSync("tooling/src/verify/gates/*.ts", { cwd: root })
    .filter((path) => !DECLARATION_RE.test(path))
    .sort();
  const imported: ImportedPolicy[] = [];
  for (const rel of files) {
    imported.push(await importPolicy(root, rel));
  }
  assertUniqueIds(imported);
  assertFilenameIds(imported);
  const gates = imported.map(({ gate }) => gate);
  return { gates, files, families: [...new Set(gates.map(({ family }) => family))].toSorted() };
}

export async function loadPolicies(root: string): Promise<readonly GatePolicy[]> {
  return (await loadPolicyCorpus(root)).gates;
}

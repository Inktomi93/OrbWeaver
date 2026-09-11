// The FINAL contract's MODULE-level rules, as pure functions over an already-imported module namespace: exactly one
// branded descriptor and it is exported as `gate`; the descriptor validates; `id` equals the filename; ids are
// unique across a corpus; a singleton family equals its sole id. Split out of lib/policy-loader.ts so the mixed
// loader (lib/loader.ts) and the final-only view (lib/policy-loader.ts) share ONE spelling of every rule without
// importing each other. Discovery and `import()` live in lib/loader.ts; nothing here touches the filesystem.
import type { GatePolicy } from "../contract/policy.ts";
import { isDefinedGatePolicy } from "../contract/policy.ts";
import { assertGatePolicyDescriptor } from "./policy-validation.ts";

const BASENAME_RE = /([^/]+)\.ts$/u;

/** The keys every `defineGate` descriptor carries. Used ONLY to word a refusal (an unbranded object carrying them
 *  was almost certainly a spread/clone that lost the brand) — never to decide the contract. */
const FINAL_SHAPE_KEYS = ["id", "family", "authority", "create"] as const;

export interface LoadedPolicy {
  readonly gate: GatePolicy;
  readonly rel: string;
}

/** Every branded `defineGate` export of a module, by export name. */
export function brandedExportsOf(module: Readonly<Record<string, unknown>>): readonly (readonly [string, GatePolicy])[] {
  return Object.entries(module).filter((entry): entry is [string, GatePolicy] => isDefinedGatePolicy(entry[1]));
}

/** Does an unbranded object carry the final contract's required keys? A hint for the refusal text only. */
export function looksFinalShaped(value: unknown): boolean {
  return typeof value === "object" && value !== null && FINAL_SHAPE_KEYS.every((key) => Object.hasOwn(value, key));
}

/** The module's one final policy, or a thrown refusal naming the module: exactly one branded export, exported as
 *  `gate`, validated field by field. The caller has already established that `module.gate` is branded (the
 *  classification step); this asserts everything else the final loader has always asserted. */
export function assertPolicyModuleExport(module: Readonly<Record<string, unknown>>, rel: string): GatePolicy {
  const branded = brandedExportsOf(module);
  const gate = module["gate"];
  if (branded.length === 0 || gate === undefined) {
    throw new Error(`gate module ${rel} must export exactly one \`gate\` created by defineGate`);
  }
  if (branded.length !== 1 || branded[0]?.[0] !== "gate") {
    throw new Error(
      `gate module ${rel} must export exactly one defineGate descriptor named \`gate\`; found ${branded.length} (${branded.map(([name]) => name).join(", ")})`,
    );
  }
  if (!isDefinedGatePolicy(gate)) {
    throw new Error(`gate module ${rel} exports a descriptor that was not created by defineGate`);
  }
  try {
    assertGatePolicyDescriptor(gate);
  } catch (error) {
    throw new Error(`gate module ${rel}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
  return gate;
}

export function assertUniquePolicyIds(loaded: readonly LoadedPolicy[]): void {
  const groups = Map.groupBy(loaded, ({ gate }) => gate.id);
  for (const [id, rows] of [...groups].toSorted(([left], [right]) => left.localeCompare(right))) {
    if (rows.length > 1) {
      throw new Error(`duplicate gate policy id ${id}: ${rows.map(({ rel }) => rel).join(", ")}`);
    }
  }
}

/** `id` must equal the filename — the law that also makes "the same descriptor object reached through two files"
 *  impossible: a re-export shim under any other basename refuses here, naming the id it re-exported. */
export function assertPolicyFilenameId(gate: GatePolicy, rel: string): void {
  const basename = BASENAME_RE.exec(rel)?.[1];
  if (basename === undefined || gate.id !== basename) {
    throw new Error(`gate module ${rel}: descriptor.id (${gate.id}) must equal the filename (${String(basename)})`);
  }
}

export function policyFamilyNames(gates: readonly GatePolicy[]): readonly string[] {
  const groups = Map.groupBy(gates, ({ family }) => family);
  for (const [family, members] of [...groups].toSorted(([left], [right]) => left.localeCompare(right))) {
    const only = members[0];
    if (members.length === 1 && only !== undefined && only.id !== family) {
      throw new Error(`singleton family ${family} must equal its sole policy id ${only.id}`);
    }
  }
  return [...groups.keys()].toSorted();
}

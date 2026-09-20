// The connection editor's FACT-ROW model — the ONE grammar both Advanced blocks render through (inference
// program §5.3a · the step-3b mock `editor.html` Board B): `declared` ("What this server accepts") and
// `features` ("Endpoint quirks") are different schemas with the same reading job, so they get one row shape,
// one source-line derivation and one per-field Override write path. Split out of
// `connection-editor-model.ts` at the `component-size` cap; that file keeps the tier-level reads (the
// verdict, the badge rail, the extras rows, the admission predicate) and this one keeps the grammar.
//
// THE SOURCE LINE IS DERIVED, NEVER ASSERTED, and the two blocks are honest to DIFFERENT depths — stated
// here because the mock is not:
//   • QUIRKS are fully derivable. `ProviderDef.features` rides to the client on
//     `connection.providersAvailable`, `foldFeatures`/`WIRE_DEFAULT_FEATURES` are isomorphic
//     (`@orb/contracts/inference/features.ts`), and the row's own override is `declared.features`. So a quirk
//     row states its true resolved value, its true layer, and — when overridden — the exact value it replaced.
//   • CAPABILITY rows are NOT. `connection.capabilities` returns the FOLDED descriptor only
//     (`domain/connection/contract/results.ts::ConnectionCapabilityView`); there is no per-field provenance and
//     no baseline-without-`declared` anywhere on the wire, and the synthesis that would produce one is
//     node-only. The mock's "reported by the server" / "measured on the first turn" / "your override — the
//     server reported 4,096" are MOCK INVENTION, not §5.3a copy (DESIGN.md §4's inventory lists no capability
//     source string), so they are NOT rendered: a fabricated number is the worst thing a diagnostics surface
//     can carry. The rows say only what is true, and `capabilityFactRows` takes the missing fact as an
//     OPTIONAL `baseline` parameter — #2478 wires `CapabilityRead.baseline` into it and the restatement turns
//     on with no other edit.

import type { Capability, DeclaredCapability, EndpointFeatures } from "@orb/contracts/inference";
import { EFFORT_SPELLINGS, foldFeatures, IMAGE_ARMS, OUTPUT_CAP_FIELDS, PREFILL_MODES, REASONING_MODES, STRICT_JSON_MODES } from "@orb/contracts/inference";

/** Digit grouping for a COUNT. Deliberately not `toLocaleString`/`Intl`: these are token counts and vector
 *  widths, not dates or money, and the `no-raw-intl-time` gate exists because a bare `.toLocale*()` is Intl
 *  by the back door — un-memoized and locale-drifting — in a surface whose whole job is a stable reading. */
function grouped(value: unknown): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// ── the Advanced tier: ONE fact-row grammar for both blocks ────────────────────────────────────────────

/**
 * The control an Override reveals for ONE fact. Five kinds cover every row in both blocks — which is WHY
 * both blocks are flattened to LEAVES.
 *
 * STATED DEVIATION FROM THE MOCK (Board B): the drawing joins two composite quirks into one reading row
 * (`sleep endpoints: /is_sleeping · /wake_up`, `price: $x in · $y out`). A joined row reads fine and has no
 * editor, and §5.3a's affordance is ONE OVERRIDE PER FIELD — an Override that silently skips the composite
 * fields is that affordance with holes in it. Splitting them costs one extra line of reading each and makes
 * every row in both blocks overridable through the same four controls.
 */
/** NOT exported: `no-inline-types` refuses an exported UNION outside a type home, and no consumer needs
 *  the name — a component types its parameter as `FactRow["edit"]`, which is the same type by construction. */
type FactEdit =
  | { readonly kind: "text" }
  | { readonly kind: "number" }
  | { readonly kind: "boolean" }
  | { readonly kind: "list" }
  | { readonly kind: "enum"; readonly options: readonly string[] };

export interface FactRow {
  /** The DOTTED path from the `declared` block's root (`features.prefill`, `generation.context.window`) —
   *  the React key, the subject of the row's `Override`/`Reset` accessible name, and the write target. */
  readonly path: string;
  /** The key column. Plain words except where the string IS the wire's (§5.3a: `prefill` survives raw). */
  readonly name: string;
  /** The resolved value, formatted for reading. */
  readonly value: string;
  /** Where the resolved value came from — only ever what this client can actually prove. */
  readonly source: string;
  /** `true` ⇒ the row's own `declared` block states this field: a colour change and `Reset` instead of
   *  `Override`. */
  readonly overridden: boolean;
  readonly edit: FactEdit;
  /** What the Override control opens seeded with — the resolved value in the control's own spelling. */
  readonly draft: string;
  /** Paths a write must set ALONGSIDE the leaf because their schema requires them: `rangeSchema` needs
   *  `min` beside `max`, so a bare `max` write would not parse. Empty on every row but that one. */
  readonly siblings: Readonly<Record<string, unknown>>;
}

/** One row's static description — the reading name, the control, and how the raw value reads. */
interface FactLeaf {
  readonly path: string;
  readonly name: string;
  readonly edit: FactEdit;
  readonly format?: (value: unknown) => string;
}

function readPath(root: unknown, path: string): unknown {
  let cursor: unknown = root;
  for (const segment of path.split(".")) {
    if (typeof cursor !== "object" || cursor === null) {
      return;
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

/** Immutably set one dotted path, minting the intermediate objects it needs. */
function writePath(root: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const [head, ...rest] = path.split(".");
  if (head === undefined) {
    return root;
  }
  if (rest.length === 0) {
    return { ...root, [head]: value };
  }
  const child = root[head];
  const branch = typeof child === "object" && child !== null && !Array.isArray(child) ? (child as Record<string, unknown>) : {};
  return { ...root, [head]: writePath(branch, rest.join("."), value) };
}

/** Immutably drop one dotted path, PRUNING every ancestor the drop empties — an override that leaves
 *  `{ generation: { context: {} } }` behind still counts as a stated field to the badge and to the server. */
function erasePath(root: Record<string, unknown>, path: string): Record<string, unknown> {
  const [head, ...rest] = path.split(".");
  if (head === undefined || !(head in root)) {
    return root;
  }
  const next = { ...root };
  if (rest.length === 0) {
    delete next[head];
    return next;
  }
  const child = next[head];
  if (typeof child !== "object" || child === null || Array.isArray(child)) {
    return root;
  }
  const pruned = erasePath(child as Record<string, unknown>, rest.join("."));
  if (Object.keys(pruned).length === 0) {
    delete next[head];
    return next;
  }
  next[head] = pruned;
  return next;
}

/** The raw value an Override control's text produces, by control kind. */
export function parseFactValue(edit: FactRow["edit"], raw: string): unknown {
  if (edit.kind === "number") {
    return Number(raw.trim());
  }
  if (edit.kind === "boolean") {
    return raw === "true";
  }
  if (edit.kind === "list") {
    return raw
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part !== "");
  }
  return raw.trim();
}

/** The control's seed for a resolved value — the inverse of {@link parseFactValue}. */
function draftOf(edit: FactEdit, value: unknown): string {
  if (edit.kind === "list") {
    return Array.isArray(value) ? value.map((part) => String(part)).join(", ") : "";
  }
  return String(value);
}

/** How a raw leaf value READS when the leaf states no formatter of its own. */
function readValue(edit: FactEdit, value: unknown): string {
  if (edit.kind === "boolean") {
    return value === true ? "yes" : "no";
  }
  if (edit.kind === "list") {
    return Array.isArray(value) ? value.map((part) => String(part)).join(", ") : "";
  }
  return String(value);
}

function formatLeaf(leaf: FactLeaf, value: unknown): string {
  return leaf.format === undefined ? readValue(leaf.edit, value) : leaf.format(value);
}

/** Write ONE fact override into the row's `declared` block (the patch `connection.update` takes). */
export function withDeclaredOverride(declared: DeclaredCapability | null, row: FactRow, value: unknown): DeclaredCapability {
  let next: Record<string, unknown> = { ...(declared ?? {}) };
  for (const [siblingPath, siblingValue] of Object.entries(row.siblings)) {
    next = writePath(next, siblingPath, siblingValue);
  }
  return writePath(next, row.path, value) as DeclaredCapability;
}

/** Drop ONE fact override; `null` once the block states nothing at all (the column's "nothing declared"). */
export function withoutDeclaredOverride(declared: DeclaredCapability | null, row: FactRow): DeclaredCapability | null {
  if (declared === null) {
    return null;
  }
  const next = erasePath({ ...declared }, row.path);
  for (const siblingPath of Object.keys(row.siblings)) {
    // A sibling only exists because the leaf needed it; it goes with the leaf.
    Object.assign(next, erasePath(next, siblingPath));
  }
  return Object.keys(next).length === 0 ? null : (next as DeclaredCapability);
}

/** The layer a resolved value came from, named the way a reader can act on. */
function layerSource(providerLabel: string, fromProvider: boolean): string {
  return fromProvider ? `from the ${providerLabel} provider row` : "the default for this kind of server";
}

/** An overridden row's source line — it restates the value it REPLACED whenever that value is knowable, so
 *  the thing you overrode is never hidden by the override (§5.3a). `replaced === undefined` means this client
 *  cannot know it (see the header); the line then says so instead of inventing one. */
function overrideSource(providerLabel: string, fromProvider: boolean, replaced: string | undefined): string {
  if (replaced === undefined) {
    return "your override";
  }
  return fromProvider ? `your override — the ${providerLabel} provider row says ${replaced}` : `your override — the default is ${replaced}`;
}

// ── "Endpoint quirks" (= `features`) ───────────────────────────────────────────────────────────────────

/** Every top-level `EndpointFeatures` key → the LEAF paths that render it. A `Record` over the schema's own
 *  keys, so a new feature field is a `tsc` error HERE rather than a quirk nothing renders; the unit pin
 *  closes the other half (every path named here has a `QUIRK_LEAVES` row, and no row names a path that is
 *  not here). */
const QUIRK_LEAF_PATHS: Record<keyof Required<EndpointFeatures>, readonly string[]> = {
  prefill: ["prefill"],
  prefillSuppressesThinking: ["prefillSuppressesThinking"],
  strictJson: ["strictJson"],
  effort: ["effort"],
  outputCapField: ["outputCapField"],
  reasoningKeys: ["reasoningKeys"],
  images: ["images"],
  rerankPath: ["rerankPath"],
  sleep: ["sleep.isSleepingPath", "sleep.wakePath"],
  pricing: ["pricing.inputPerMTok", "pricing.outputPerMTok"],
  concurrency: ["concurrency.embed", "concurrency.imageEmbed", "concurrency.summarize"],
  embedBatch: ["embedBatch.maxTokens", "embedBatch.floorTokensPerSec"],
  requestTimeoutMs: ["requestTimeoutMs"],
};

/** The quirk rows, in the PANE's render order (the schema's declaration order is not a UI decision).
 *
 *  §5.3a's KEY rule, applied leaf by leaf: a quirk key stays in the WIRE's spelling only when that exact
 *  string IS the wire's. `prefill` is the one such case — §5.3a's own worked example and a real wire
 *  technique. Every other key here is our own TypeScript property name, which no server's documentation
 *  contains, so it is written in plain words and the wire's string stays in the VALUE (`reasoning fields` →
 *  `reasoning, reasoning_content`). */
const QUIRK_LEAVES: readonly FactLeaf[] = [
  { path: "prefill", name: "prefill", edit: { kind: "enum", options: PREFILL_MODES } },
  { path: "prefillSuppressesThinking", name: "prefill suppresses thinking", edit: { kind: "boolean" } },
  { path: "strictJson", name: "strict JSON", edit: { kind: "enum", options: STRICT_JSON_MODES } },
  { path: "effort", name: "effort field", edit: { kind: "enum", options: EFFORT_SPELLINGS } },
  { path: "outputCapField", name: "output cap field", edit: { kind: "enum", options: OUTPUT_CAP_FIELDS } },
  { path: "reasoningKeys", name: "reasoning fields", edit: { kind: "list" } },
  { path: "images", name: "image generation arm", edit: { kind: "enum", options: IMAGE_ARMS } },
  { path: "rerankPath", name: "rerank path", edit: { kind: "text" } },
  { path: "sleep.isSleepingPath", name: "sleep check path", edit: { kind: "text" } },
  { path: "sleep.wakePath", name: "wake path", edit: { kind: "text" } },
  { path: "pricing.inputPerMTok", name: "price in", edit: { kind: "number" }, format: perMillionTokens },
  { path: "pricing.outputPerMTok", name: "price out", edit: { kind: "number" }, format: perMillionTokens },
  { path: "concurrency.embed", name: "embeddings at once", edit: { kind: "number" } },
  { path: "concurrency.imageEmbed", name: "image embeddings at once", edit: { kind: "number" } },
  { path: "concurrency.summarize", name: "utility calls at once", edit: { kind: "number" } },
  { path: "embedBatch.maxTokens", name: "embedding batch ceiling", edit: { kind: "number" }, format: tokens },
  {
    path: "embedBatch.floorTokensPerSec",
    name: "embedding slow-server floor",
    edit: { kind: "number" },
    format: (value): string => `${String(value)} tokens/second`,
  },
  { path: "requestTimeoutMs", name: "request deadline", edit: { kind: "number" }, format: (value): string => `${String(value)} ms` },
];

function perMillionTokens(value: unknown): string {
  return `$${String(value)} per million tokens`;
}

function tokens(value: unknown): string {
  return `${grouped(value)} tokens`;
}

/** The leaf paths, for the completeness pin — the anchor `Record` above is the `tsc` half. */
export const QUIRK_LEAF_PATH_LIST: readonly string[] = Object.values(QUIRK_LEAF_PATHS).flat();
export const QUIRK_ROW_PATHS: readonly string[] = QUIRK_LEAVES.map((leaf) => leaf.path);

/** "Endpoint quirks" — one row per FOLDED leaf, with the layer it came from and, when the row overrides it,
 *  the value it replaced. Fully derivable: every layer is in the client's hands. */
export function quirkFactRows(
  providerFeatures: EndpointFeatures | undefined,
  declaredFeatures: EndpointFeatures | undefined,
  providerLabel: string,
): readonly FactRow[] {
  const base = foldFeatures(providerFeatures);
  const folded = foldFeatures(providerFeatures, declaredFeatures);
  const rows: FactRow[] = [];
  for (const leaf of QUIRK_LEAVES) {
    const value = readPath(folded, leaf.path);
    if (value === undefined) {
      continue;
    }
    const fromProvider = readPath(providerFeatures, leaf.path) !== undefined;
    const overridden = readPath(declaredFeatures, leaf.path) !== undefined;
    const replaced = readPath(base, leaf.path);
    rows.push({
      path: `features.${leaf.path}`,
      name: leaf.name,
      value: formatLeaf(leaf, value),
      source: overridden
        ? overrideSource(providerLabel, fromProvider, replaced === undefined ? undefined : formatLeaf(leaf, replaced))
        : layerSource(providerLabel, fromProvider),
      overridden,
      edit: leaf.edit,
      draft: draftOf(leaf.edit, value),
      siblings: {},
    });
  }
  return rows;
}

// ── "What this server accepts" (= the `declared` capability) ───────────────────────────────────────────

/** The source line for a capability row this client cannot attribute per field. Deliberately NOT one of the
 *  mock's four invented strings — see the file header and #2478. */
const CAPABILITY_SOURCE = "what this server and model report";

const GENERATION_LEAVES: readonly FactLeaf[] = [
  { path: "generation.context.window", name: "context window", edit: { kind: "number" }, format: tokens },
  { path: "generation.output.maxTokens.max", name: "max output", edit: { kind: "number" }, format: tokens },
  { path: "generation.input", name: "takes", edit: { kind: "list" } },
  { path: "generation.output.modalities", name: "gives back", edit: { kind: "list" } },
  { path: "generation.reasoning.enabled", name: "thinking", edit: { kind: "boolean" } },
  { path: "generation.reasoning.mode", name: "thinking dial", edit: { kind: "enum", options: REASONING_MODES } },
  { path: "generation.output.structured", name: "structured output", edit: { kind: "boolean" } },
  { path: "generation.tools.parallel", name: "parallel tool calls", edit: { kind: "boolean" } },
];

const EMBEDDING_LEAVES: readonly FactLeaf[] = [
  { path: "embedding.dims", name: "vector width", edit: { kind: "number" }, format: (value): string => `${String(value)} numbers` },
  { path: "embedding.mrl", name: "truncatable", edit: { kind: "boolean" } },
  { path: "embedding.maxInputTokens", name: "max input", edit: { kind: "number" }, format: tokens },
  { path: "embedding.input", name: "takes", edit: { kind: "list" } },
];

const RERANK_LEAVES: readonly FactLeaf[] = [
  { path: "rerank.maxInputTokens", name: "max input", edit: { kind: "number" }, format: tokens },
  { path: "rerank.input", name: "takes", edit: { kind: "list" } },
];

// An if-chain with a BARE tail, the `capability/reads.ts::missingClauses` idiom: biome cannot narrow a
// cross-module discriminated union inside a switch. Exhaustiveness stays compile-time — a fourth kind widens
// the tail and `.rerank` stops existing on it.
function leavesOf(capability: Capability): readonly FactLeaf[] {
  if (capability.kind === "generation") {
    return GENERATION_LEAVES;
  }
  if (capability.kind === "embedding") {
    return EMBEDDING_LEAVES;
  }
  return RERANK_LEAVES;
}

function capabilitySource(overridden: boolean, replaced: string | undefined): string {
  if (!overridden) {
    return CAPABILITY_SOURCE;
  }
  return replaced === undefined ? "your override" : `your override — it was ${replaced}`;
}

/** The one leaf whose schema sibling is REQUIRED: `output.maxTokens` is a `rangeSchema`, so a write naming
 *  only `max` would not parse. The sibling rides from the RESOLVED value, which is what the user is
 *  declaring around. */
const MAX_TOKENS_PATH = "generation.output.maxTokens.max";
const MAX_TOKENS_MIN_PATH = "generation.output.maxTokens.min";

function siblingsFor(path: string, capability: Capability): Readonly<Record<string, unknown>> {
  if (path !== MAX_TOKENS_PATH) {
    return {};
  }
  const min = readPath(capability, MAX_TOKENS_MIN_PATH);
  return min === undefined ? {} : { [MAX_TOKENS_MIN_PATH]: min };
}

/**
 * "What this server accepts" — the same row grammar as the quirks, over the FOLDED capability.
 *
 * `baseline` is THE #2478 SEAM and the only thing missing from this block: hand it the same synthesis
 * computed WITHOUT the row's `declared` and every overridden row restates the value it replaced, exactly as
 * the quirks already do. Until `CapabilityRead` carries it, the parameter is absent at the one call site and
 * the source line says "your override" with no invented prior.
 */
export function capabilityFactRows(capability: Capability, declared: DeclaredCapability | null, baseline?: Capability): readonly FactRow[] {
  const rows: FactRow[] = [];
  for (const leaf of leavesOf(capability)) {
    const value = readPath(capability, leaf.path);
    if (value === undefined) {
      continue;
    }
    const overridden = readPath(declared, leaf.path) !== undefined;
    const prior = baseline === undefined || !overridden ? undefined : readPath(baseline, leaf.path);
    rows.push({
      path: leaf.path,
      name: leaf.name,
      value: formatLeaf(leaf, value),
      source: capabilitySource(overridden, prior === undefined ? undefined : formatLeaf(leaf, prior)),
      overridden,
      edit: leaf.edit,
      draft: draftOf(leaf.edit, value),
      siblings: siblingsFor(leaf.path, capability),
    });
  }
  return rows;
}

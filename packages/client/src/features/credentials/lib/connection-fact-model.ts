// The connection editor's FACT-ROW model — the ONE grammar both Advanced blocks render through (inference
// program §5.3a · the step-3b mock `editor.html` Board B): `declared` ("What this server accepts") and
// `features` ("Endpoint quirks") are different schemas with the same reading job, so they get one row shape,
// one source-line derivation and one per-field Override write path. Split out of
// `connection-editor-model.ts` at the `component-size` cap; that file keeps the tier-level reads (the
// verdict, the badge rail, the extras rows, the admission predicate), this one keeps the grammar and the
// quirk rows, and `connection-capability-fact-model.ts` keeps the capability rows.
//
// THE SOURCE LINE IS DERIVED, NEVER ASSERTED, and the two blocks are honest to DIFFERENT depths — stated
// here because the mock is not:
//   • QUIRKS are fully derivable. `ProviderDef.features` rides to the client on
//     `connection.providersAvailable`, `foldFeatures`/`WIRE_DEFAULT_FEATURES` are isomorphic
//     (`@orb/contracts/inference/features.ts`), and the row's own override is `declared.features`. So a quirk
//     row states its true resolved value, its true layer, and — when overridden — the exact value it replaced.
//   • CAPABILITY rows are NOT. `connection.capabilities` returns the FOLDED descriptor plus a `baseline` (the
//     same fold without the row's `declared`), and no per-field provenance; the synthesis is node-only. The
//     mock's "reported by the server" / "measured on the first turn" strings are MOCK INVENTION, so they are
//     NOT rendered: a fabricated number is the worst thing a diagnostics surface can carry. A row says only
//     what is true: the value, "assumed" where the fold marks the value as a floor guess, and the replaced
//     value from `baseline` when the row is overridden.
//
// A LEAF THE FOLD DOES NOT STATE STILL RENDERS when it can be declared on its own (`unset`): a local model
// with no stated tool calls must be able to say "this server takes tools", and a missing row cannot be
// overridden. Composite leaves whose schema needs a sibling (`sleep`, `pricing`, `embedBatch`) render only
// when stated, because a lone half would not parse at the verb.

import type { DeclaredCapability, EndpointFeatures } from "@orb/contracts/inference";
import {
  BANNED_STRINGS_SPELLINGS,
  EFFORT_SPELLINGS,
  foldFeatures,
  IMAGE_ARMS,
  MODEL_INFO_APIS,
  NATIVE_CHAT_APIS,
  OUTPUT_CAP_FIELDS,
  PREFILL_MODES,
  REASONING_BUDGET_FIELDS,
  SAMPLER_KNOBS,
  SAMPLER_ORDER_SPELLINGS,
  STRICT_JSON_MODES,
  SUMMARIZE_CONCURRENCY_MAX,
  THINKING_OFF_SPELLINGS,
  TOKENIZE_APIS,
} from "@orb/contracts/inference";

import { grouped as formatGrouped, tokens as formatTokens, samplerWords } from "./connection-fact-format.ts";
import type { BooleanLabels, FactLeaf, FactRow, NumberBound } from "./connection-fact-types.ts";
import { pricingFactLeaves, pricingSiblings } from "./connection-pricing.ts";

export type { BooleanLabels, FactChoice, FactLeaf, FactRow, NumberBound } from "./connection-fact-types.ts";

export const grouped = formatGrouped;
export const tokens = formatTokens;

// ── the Advanced tier: ONE fact-row grammar for both blocks ────────────────────────────────────────────

const SUMMARIZE_MAX: NumberBound = { value: SUMMARIZE_CONCURRENCY_MAX, reads: String(SUMMARIZE_CONCURRENCY_MAX) };

/** The refusal for a typed number outside its fact's bounds, else `null`. */
export function boundRefusal(edit: FactRow["edit"], raw: string): string | null {
  if (edit.kind !== "number" || raw.trim() === "") {
    return null;
  }
  const below = edit.min !== undefined && Number(raw) < edit.min.value ? `The minimum is ${edit.min.reads}.` : null;
  return below ?? (edit.max !== undefined && Number(raw) > edit.max.value ? `The maximum is ${edit.max.reads}.` : null);
}

/** The plain reading of a boolean fact, for a leaf that states no labels of its own. */
export const PLAIN_BOOLEAN_LABELS: BooleanLabels = { yes: "yes", no: "no" };

export const NOT_STATED = "not stated";
const NOT_SET = "not set";

export function readPath(root: unknown, path: string): unknown {
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
  if (edit.kind === "choice") {
    return edit.choices.find((choice) => choice.label === raw)?.writes;
  }
  return raw.trim();
}

/** The control's seed for a resolved value — the inverse of {@link parseFactValue}. An unstated leaf seeds the
 *  control's first choice (a boolean seeds "no", the cautious answer) or an empty field. */
export function draftOf(edit: FactRow["edit"], value: unknown): string {
  if (edit.kind === "choice") {
    return (value === undefined ? edit.choices[0] : edit.choices.find((choice) => choice.matches(value)))?.label ?? "";
  }
  if (value === undefined) {
    if (edit.kind === "boolean") {
      return "false";
    }
    return edit.kind === "enum" ? (edit.options[0] ?? "") : "";
  }
  if (edit.kind === "list") {
    return Array.isArray(value) ? value.map((part) => String(part)).join(", ") : "";
  }
  return String(value);
}

/** How a raw leaf value READS when the leaf states no formatter of its own. */
function readValue(edit: FactRow["edit"], value: unknown): string {
  if (edit.kind === "boolean") {
    const labels = edit.labels ?? PLAIN_BOOLEAN_LABELS;
    return value === true ? labels.yes : labels.no;
  }
  if (edit.kind === "list") {
    return Array.isArray(value) ? value.map((part) => String(part)).join(", ") : "";
  }
  if (edit.kind === "choice") {
    return edit.choices.find((choice) => choice.matches(value))?.label ?? String(value);
  }
  return String(value);
}

export function formatLeaf(leaf: FactLeaf, value: unknown): string {
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

/** The row for a declarable leaf the fold states nothing for: its absence reading, and an Override that opens
 *  on the control's first choice. Never overridden — a declared leaf has a value. */
export function unsetRow(path: string, leaf: FactLeaf, value: string, source: string): FactRow {
  return { path, name: leaf.name, value, source, overridden: false, edit: leaf.edit, draft: draftOf(leaf.edit, undefined), siblings: {} };
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
  // Not an editor field: a connection's only non-body inputs are the Advanced capability settings (owner ruling,
  // docs/adr/0301-structured-output-plan-one-home.md), so the grammar vocabulary stays the provider row's or the detected one's.
  structuredMode: [],
  effort: ["effort"],
  outputCapField: ["outputCapField"],
  reasoningKeys: ["reasoningKeys"],
  images: ["images"],
  rerankPath: ["rerankPath"],
  modelInfoApi: ["modelInfoApi"],
  nativeChat: ["nativeChat"],
  detectServer: ["detectServer"],
  sleep: ["sleep.isSleepingPath", "sleep.wakePath"],
  pricing: ["pricing.inputPerMTok", "pricing.outputPerMTok", "pricing.cacheReadPerMTok", "pricing.cacheWritePerMTok"],
  concurrency: ["concurrency.embed", "concurrency.imageEmbed", "concurrency.summarize"],
  embedBatch: ["embedBatch.maxTokens", "embedBatch.floorTokensPerSec"],
  requestTimeoutMs: ["requestTimeoutMs"],
  samplerKeys: SAMPLER_KNOBS.map((knob) => `samplerKeys.${knob}`),
  // Not an editor field: which extra spellings a server folds is the provider row's fact, and a user who wants one
  // spelling sets it in their own body, where it stands alone.
  samplerAliases: [],
  samplerOrder: ["samplerOrder"],
  bannedStrings: ["bannedStrings"],
  tokenizeApi: ["tokenizeApi"],
  reasoningBudgetField: ["reasoningBudgetField"],
  keepAlive: ["keepAlive"],
  numBatch: ["numBatch"],
  thinkingOff: ["thinkingOff"],
};

/** The quirk rows, in the PANE's render order (the schema's declaration order is not a UI decision).
 *
 *  §5.3a's KEY rule, applied leaf by leaf: a quirk key stays in the WIRE's spelling only when that exact
 *  string IS the wire's. `prefill` is the one such case — §5.3a's own worked example and a real wire
 *  technique. Every other key here is our own TypeScript property name, which no server's documentation
 *  contains, so it is written in plain words and the wire's string stays in the VALUE (`reasoning fields` →
 *  `reasoning, reasoning_content`). */
const QUIRK_LEAVES: readonly FactLeaf[] = [
  { path: "prefill", name: "prefill", edit: { kind: "enum", options: PREFILL_MODES }, unset: NOT_SET },
  { path: "prefillSuppressesThinking", name: "prefill suppresses thinking", edit: { kind: "boolean" }, unset: NOT_SET },
  { path: "strictJson", name: "strict JSON", edit: { kind: "enum", options: STRICT_JSON_MODES }, unset: NOT_SET },
  { path: "effort", name: "effort field", edit: { kind: "enum", options: EFFORT_SPELLINGS }, unset: NOT_SET },
  { path: "outputCapField", name: "output cap field", edit: { kind: "enum", options: OUTPUT_CAP_FIELDS }, unset: NOT_SET },
  { path: "reasoningKeys", name: "reasoning fields", edit: { kind: "list" }, unset: NOT_SET },
  { path: "images", name: "image generation arm", edit: { kind: "enum", options: IMAGE_ARMS }, unset: "not set — no image generation" },
  { path: "rerankPath", name: "rerank path", edit: { kind: "text" }, unset: "not set — no reranking" },
  { path: "modelInfoApi", name: "model info API", edit: { kind: "enum", options: MODEL_INFO_APIS }, unset: NOT_SET },
  { path: "nativeChat", name: "native chat route", edit: { kind: "enum", options: NATIVE_CHAT_APIS }, unset: "not set — chat uses /v1" },
  { path: "detectServer", name: "detect the server", edit: { kind: "boolean" }, unset: NOT_SET },
  { path: "sleep.isSleepingPath", name: "sleep check path", edit: { kind: "text" } },
  { path: "sleep.wakePath", name: "wake path", edit: { kind: "text" } },
  ...pricingFactLeaves(NOT_SET),
  { path: "concurrency.embed", name: "embeddings at once", edit: { kind: "number" } },
  { path: "concurrency.imageEmbed", name: "image embeddings at once", edit: { kind: "number" } },
  { path: "concurrency.summarize", name: "utility calls at once", edit: { kind: "number", max: SUMMARIZE_MAX } },
  { path: "embedBatch.maxTokens", name: "embedding batch ceiling", edit: { kind: "number" }, format: tokens },
  {
    path: "embedBatch.floorTokensPerSec",
    name: "embedding slow-server floor",
    edit: { kind: "number" },
    format: (value): string => `${String(value)} tokens/second`,
  },
  {
    path: "requestTimeoutMs",
    name: "request deadline",
    edit: { kind: "number" },
    format: (value): string => `${String(value)} ms`,
    unset: NOT_SET,
  },
  { path: "samplerOrder", name: "sampler order vocabulary", edit: { kind: "enum", options: SAMPLER_ORDER_SPELLINGS }, unset: NOT_SET },
  { path: "bannedStrings", name: "banned phrases form", edit: { kind: "enum", options: BANNED_STRINGS_SPELLINGS }, unset: "not set — a phrase list" },
  { path: "tokenizeApi", name: "tokenize endpoint", edit: { kind: "enum", options: TOKENIZE_APIS }, unset: "not set — logit bias takes token ids only" },
  {
    path: "reasoningBudgetField",
    name: "thinking budget field",
    edit: { kind: "enum", options: REASONING_BUDGET_FIELDS },
    unset: "not set — no thinking budget",
  },
  { path: "keepAlive", name: "keep model loaded for", edit: { kind: "text" }, unset: "not set — the server's default" },
  { path: "numBatch", name: "prompt batch size", edit: { kind: "number" }, unset: "not set — the server's default" },
  { path: "thinkingOff", name: "template thinking switch", edit: { kind: "enum", options: THINKING_OFF_SPELLINGS }, unset: NOT_SET },
  // One row per spelling the row states; a server that reads the default key needs none.
  ...SAMPLER_KNOBS.map((knob): FactLeaf => ({ path: `samplerKeys.${knob}`, name: `${samplerWords(knob)} field`, edit: { kind: "text" } })),
];

/** The leaf paths, for the completeness pin — the anchor `Record` above is the `tsc` half.
 * @public Test-anchored module surface; focused tests pin this production-local behavior. */
export const QUIRK_LEAF_PATH_LIST: readonly string[] = Object.values(QUIRK_LEAF_PATHS).flat();
/** The same set derived from the ROW list — the two derivations must agree.
 * @public Test-anchored module surface; focused tests pin this production-local behavior. */
export const QUIRK_ROW_PATHS: readonly string[] = QUIRK_LEAVES.map((leaf) => leaf.path);

function unstatedQuirkRow(leaf: FactLeaf, folded: EndpointFeatures, showUnset: boolean): FactRow | undefined {
  if (leaf.unset === undefined) {
    return;
  }
  if (leaf.path.startsWith("pricing.") ? folded.pricing === undefined : !showUnset) {
    return;
  }
  return unsetRow(`features.${leaf.path}`, leaf, leaf.unset, "nothing sets it for this kind of server");
}

/** "Endpoint quirks" — one row per FOLDED leaf, with the layer it came from and, when the row overrides it,
 *  the value it replaced. Fully derivable: every layer is in the client's hands. `showUnset` adds the
 *  declarable leaves nothing sets — an own-server row is fully user-declared (Tier-3b §10.10), a hosted
 *  provider's quirks are its row's. */
export function quirkFactRows(
  providerFeatures: EndpointFeatures | undefined,
  declaredFeatures: EndpointFeatures | undefined,
  providerLabel: string,
  showUnset = false,
): readonly FactRow[] {
  const base = foldFeatures(providerFeatures);
  const folded = foldFeatures(providerFeatures, declaredFeatures);
  const rows: FactRow[] = [];
  for (const leaf of QUIRK_LEAVES) {
    // Declaring one optional cache rate still needs the two required base rates at the write boundary.
    const siblings = pricingSiblings(leaf.path, folded, declaredFeatures);
    const value = readPath(folded, leaf.path);
    if (value === undefined) {
      const unstated = unstatedQuirkRow(leaf, folded, showUnset);
      if (unstated !== undefined) {
        rows.push({ ...unstated, siblings });
      }
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
      siblings,
    });
  }
  return rows;
}

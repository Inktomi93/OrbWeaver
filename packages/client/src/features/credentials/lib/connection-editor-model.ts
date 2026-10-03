// The connection EDITOR's pure model (inference program §5.3a, step 9 · the step-3b
// mock): the TIER-LEVEL derived content — the inferred-kind verdict,
// the task-requirement badge rail, the two tier count badges, the Extras rows and their belt gloss, the
// request-body overrides field, and the private-endpoint admission predicate. No JSX, no hooks — every
// function here is a fold over data already on the wire.
//
// The Advanced tier's FACT-ROW grammar (both blocks' rows, their source lines and the per-field Override
// write path) is the other half, at `connection-fact-model.ts` — split at the `component-size` cap, and the
// honesty rules that govern what a source line may say live in THAT file's header.

import type { Capability, ConnectionTransportDoc, DeclaredCapability, ModelKind, RoutableTask, Task } from "@orb/contracts/inference";
import { BELT_OWNED_BODY_KEYS, connectionTransportSchema, EMBED_SPACE_DIMS, requirementMet, spaceMisfitReason, taskDef } from "@orb/contracts/inference";
import { errorMessage } from "@orb/kit/error-message";
import { effectiveHttpPort } from "@orb/kit/http-endpoint";
// Direct, not through `#lib`: node-side CT specs import this module.
import { ROLE_ROWS_ORDERED } from "../../../lib/connection-roles.ts";
import { grouped } from "./connection-fact-model.ts";

// ── the Purpose tier: the inferred-kind verdict ────────────────────────────────────────────────────────

/** The three options §5.3a names, in TASK words — `kind` is SEALED, so the schema member never reaches copy. */
export const KIND_VERDICT_LABELS: Record<ModelKind, string> = {
  generation: "chat & writing",
  embedding: "search vectors",
  rerank: "reranking search results",
};

/** The picker's items for the verdict's inline change control (sentence case as §5.3a spells the options). */
export const KIND_VERDICT_ITEMS: readonly { readonly label: string; readonly value: ModelKind }[] = [
  { label: "Chat & writing", value: "generation" },
  { label: "Search vectors", value: "embedding" },
  { label: "Reranking search results", value: "rerank" },
];

/** The row's kind, from the SERVER'S OWN verdict rather than a second client copy of the id heuristic: the
 *  domain already folded `declared.kind ?? curatedKind(...) ?? "generation"` into `ConnectionView.tasks`
 *  (`domain/connection/substrate/kind.ts`), and `tasksOfKind` partitions the three kinds disjointly. A row
 *  the server could not classify lists generation tasks, which is the same `"generation"` fallback. */
export function inferredKindOf(tasks: readonly Task[]): ModelKind {
  if (tasks.includes("rerank")) {
    return "rerank";
  }
  return tasks.includes("embed") || tasks.includes("imageEmbed") ? "embedding" : "generation";
}

// ── the Purpose tier: the task-requirement badge rail ──────────────────────────────────────────────────

export interface CapabilityBadge {
  readonly task: RoutableTask;
  readonly label: string;
  /** `true` = this connection can serve the role; `false` renders MUTED with `✗` and the reason (§5.3a —
   *  destructive colour is reserved for a BOUND role that has actually failed). */
  readonly ok: boolean;
  /** Why not, in the user's words; `null` on a servable role. */
  readonly reason: string | null;
}

/** `requirementMet`'s `axis:member` clauses in the user's words. A clause with no phrasing falls back to the
 *  clause itself rather than being dropped — an unnamed refusal is worse than a machine one. */
const CLAUSE_WORDS: Readonly<Record<string, string>> = {
  "input:image": "no image input",
  "input:video": "no video input",
  "input:audio": "no audio input",
  "input:file": "no file input",
  "output:image": "no image output",
  tools: "no tools",
  structured: "no structured output",
  dims: "wrong vector width",
};

/** `requirementMet`'s width clause spelling (`dims:1024`). */
const DIMS_CLAUSE_PREFIX = "dims:";

function clauseWords(clause: string): string {
  const axis = clause.split(":")[0] ?? clause;
  return CLAUSE_WORDS[clause] ?? CLAUSE_WORDS[axis] ?? clause;
}

/** The verdict for ONE role slot against this connection's capability. */
function badgeFor(task: RoutableTask, label: string, capability: Capability, tasks: readonly Task[]): CapabilityBadge {
  const def = taskDef(task);
  if (def.kind !== capability.kind) {
    return { task, label, ok: false, reason: "wrong kind" };
  }
  // THE CAPABILITY REASON WINS OVER THE PROVIDER REASON, and the order is the ruling. A vLLM chat model
  // cannot serve image generation for TWO true reasons at once — the provider's `serves` does not list the
  // task, and the model declares no image output — and only the second tells the user anything they can act
  // on (drawn as "Image generation — no image output" on the mock's Board A). The provider sentence is the
  // fallback for a task nothing more specific refused.
  const verdict = requirementMet(capability, def.requires);
  if (!verdict.ok) {
    // A width clause names both widths: "wrong vector width" alone leaves the user guessing which way.
    const width = capability.kind === "embedding" && def.requires?.dims !== undefined ? spaceMisfitReason(capability.embedding, def.requires.dims) : null;
    const clauses = verdict.missing.map((clause) => (width !== null && clause.startsWith(DIMS_CLAUSE_PREFIX) ? width : clauseWords(clause)));
    return { task, label, ok: false, reason: clauses.join(", ") };
  }
  if (!tasks.includes(task)) {
    return { task, label, ok: false, reason: "this provider doesn't serve it" };
  }
  return { task, label, ok: true, reason: null };
}

/** One badge per Model-roles slot, GREENS FIRST — §5.3a truncates greens last, so the rail's order IS the
 *  truncation order and a narrow surface drops from the tail. A role of the wrong KIND says so: the
 *  requirement check cannot, because a rerank model asked for `output: image` is not missing a modality, it
 *  is the wrong thing entirely. */
export function capabilityBadges(capability: Capability, tasks: readonly Task[]): readonly CapabilityBadge[] {
  const badges = ROLE_ROWS_ORDERED.map((row) => badgeFor(row.task, row.label, capability, tasks));
  return [...badges.filter((badge) => badge.ok), ...badges.filter((badge) => !badge.ok)];
}

/** The Purpose tier's notes: what an unstated or guessed fact costs the user, and where to state it. Only facts
 *  the fold marks: on an own-server row an unstated tool-call or structured-output leaf (a hosted catalog
 *  states those), and anywhere a floor-guessed window or vector width. */
export function purposeNotes(capability: Capability, ownServer: boolean): readonly string[] {
  if (capability.kind === "embedding") {
    return capability.embedding.dimsEstimated === true
      ? [
          `This server doesn't report the vector width, so we assume ${grouped(capability.embedding.dims)}. Search needs ${grouped(EMBED_SPACE_DIMS)}-wide vectors; check the model's card and set the vector width under Advanced.`,
        ]
      : [];
  }
  if (capability.kind !== "generation") {
    return [];
  }
  const generation = capability.generation;
  const notes: string[] = [];
  if (ownServer && generation.tools === undefined) {
    notes.push(
      "Game mode writes its state with tool calls, and this model has none stated, so a game on it stays read-only. If your server supports tool calls, set tool calls under Advanced.",
    );
  }
  if (ownServer && generation.output.structured !== true) {
    notes.push("The Utility role's structured extraction needs structured output. If your server supports it, set structured output under Advanced.");
  }
  if (generation.context.windowEstimated === true) {
    notes.push(
      `This server doesn't report its context size, so we assume ${grouped(generation.context.window)} tokens. If the server's real size is smaller, long chats lose their start; set the context window under Advanced.`,
    );
  }
  return notes;
}

// ── the two tier count badges ──────────────────────────────────────────────────────────────────────────

function countLeaves(value: unknown): number {
  if (value === undefined) {
    return 0;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return 1;
  }
  return Object.values(value).reduce<number>((total, child) => total + countLeaves(child), 0);
}

/** How many LEAF fields a `declared` block states — the Advanced tier's badge, and §5.3a's
 *  `declared_overrides_measured` sentence in its second home ("3 fields overridden"; the connection row's
 *  badge is the first). `kind` counts: it is an override of the inferred verdict. */
export function declaredOverrideCount(declared: DeclaredCapability | null): number {
  return declared === null ? 0 : countLeaves(declared);
}

/** The Diagnostics tier's badge count. NOT "overridden": an Extras field and a transport map are ADDITIONS,
 *  not overrides of anything, so the badge reads "N set" (the mock design §2.4). */
export function diagnosticsSetCount(extras: Readonly<Record<string, unknown>> | null, transport: Readonly<Record<string, unknown>> | null): number {
  return Object.keys(extras ?? {}).length + Object.keys(transport ?? {}).length;
}

// ── the Diagnostics tier: the Extras row editor ────────────────────────────────────────────────────────

const BELT_STREAM_KEYS: readonly string[] = ["stream", "stream_options"];
const BELT_IDENTITY_KEYS: readonly string[] = ["model", "messages"];

/** WHY a belt key is refused, in the user's terms — one gloss per FAILURE CLASS, not one per key, because
 *  the eight keys at `@orb/contracts/inference::BELT_OWNED_BODY_KEYS` fail in exactly three ways. Written
 *  fresh from the transport: the `SCOPE_GLOSS` §5.3a used to point at went with `146f71cd5` and there is no
 *  prior string to recover. Rendered at AUTHORING time, before the turn — never as a
 *  `custom_parameters_ignored` warning after it. */
export function beltKeyGloss(key: string): string | null {
  if (!BELT_KEYS.includes(key)) {
    return null;
  }
  if (BELT_STREAM_KEYS.includes(key)) {
    return `We own ${key} — it is how the reply is read back as it arrives. This row is dropped before the request is sent.`;
  }
  if (BELT_IDENTITY_KEYS.includes(key)) {
    return `We own ${key} — the connection and the room already decide it. This row is dropped before the request is sent.`;
  }
  return `We own ${key} — getting it wrong hangs or 400s the turn, so the history fit sets it. This row is dropped before the request is sent.`;
}

/** The belt keys, from their ONE home (a literal list here would be the second home the `extras` ratchet
 *  exists to prevent). NOT exported: nothing outside this module asks "is this key the belt's" — the gloss
 *  is the whole public answer, and an exported alias would be a second name for the same tuple. */
const BELT_KEYS: readonly string[] = BELT_OWNED_BODY_KEYS;

/** ONE `extras` row while it is being edited. `id` is the row's IDENTITY (§5.3a property 1): the delete
 *  button removes THAT row and editing a key does not rebuild the list under the caret. A row with an empty
 *  key is HELD (property 2) — it survives an autosave instead of being pruned out from under the typist — and
 *  simply does not reach the saved object. */
export interface ExtraRow {
  readonly id: string;
  readonly key: string;
  readonly value: string;
}

function parseExtraValue(raw: string): unknown {
  const text = raw.trim();
  if (text === "") {
    return "";
  }
  // @orb-waive caught-failure-ownership(catch): a PARSE PROBE, not an operation — "this text is not JSON"
  // is the ANSWER, not a failure. A server extra is as often the string `research` as the number 40, and
  // this catch IS the string arm; the value round-trips to the row the user typed it in, which is the
  // surface. Ends if this ever writes rather than classifies.
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

/** The `extras` object a set of edit rows saves to: keyed rows only, last spelling of a duplicated key wins,
 *  values parsed as JSON where they parse and kept as strings where they do not (a server field is as often
 *  `"research"` as it is `40`). An empty set saves `null`, which is the column's "nothing set". */
export function extrasFromRows(rows: readonly ExtraRow[]): Record<string, unknown> | null {
  const out: Record<string, unknown> = {};
  for (const row of rows) {
    const key = row.key.trim();
    if (key !== "") {
      out[key] = parseExtraValue(row.value);
    }
  }
  return Object.keys(out).length === 0 ? null : out;
}

function stringifyExtraValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

/** The saved `extras` object as edit rows, with one empty row appended so there is always somewhere to type. */
export function rowsFromExtras(extras: Readonly<Record<string, unknown>> | null, nextId: (index: number) => string): readonly ExtraRow[] {
  const saved = Object.entries(extras ?? {}).map(([key, value], index): ExtraRow => ({ id: nextId(index), key, value: stringifyExtraValue(value) }));
  return [...saved, { id: nextId(saved.length), key: "", value: "" }];
}

// ── the Diagnostics tier: request-body overrides (`transport.includeBody`) ─────────────────────────────

/** What the overrides field saves: the object (`undefined` clears it), or why the text is refused unsaved. */
type IncludeBodyParse = { readonly ok: true; readonly includeBody: ConnectionTransportDoc["includeBody"] } | { readonly ok: false; readonly reason: string };

/** The canonical schema the connection writer validates with, so the field refuses exactly what a save would. */
const INCLUDE_BODY_SCHEMA = connectionTransportSchema.shape.includeBody;
const INCLUDE_BODY_SHAPE_REASON = 'Write one JSON object, like {"top_k": 40}.';

/** The overrides field's text as the transport value it saves. Empty text, or an empty object, clears it. */
export function parseIncludeBody(raw: string): IncludeBodyParse {
  const text = raw.trim();
  if (text === "") {
    return { ok: true, includeBody: undefined };
  }
  let json: unknown;
  try {
    json = JSON.parse(text) as unknown;
  } catch (err) {
    return { ok: false, reason: `That is not valid JSON (${errorMessage(err)}). ${INCLUDE_BODY_SHAPE_REASON}` };
  }
  const parsed = INCLUDE_BODY_SCHEMA.safeParse(json);
  if (!parsed.success || parsed.data === undefined) {
    return { ok: false, reason: INCLUDE_BODY_SHAPE_REASON };
  }
  return { ok: true, includeBody: Object.keys(parsed.data).length === 0 ? undefined : parsed.data };
}

/** The saved overrides as the field's text: indented JSON, or empty when none are set. */
export function includeBodyText(includeBody: ConnectionTransportDoc["includeBody"]): string {
  return includeBody === undefined ? "" : JSON.stringify(includeBody, null, 2);
}

// ── the Diagnostics tier: the private-endpoint admission affordance ────────────────────────────────────

/** The host the unlisted-model sentence names — the endpoint's own host for a self-hosted row, the provider's
 *  LABEL for a hosted one (a user has no URL to recognise there, and "api.openai.com" is not the noun they
 *  picked). Distinct from {@link endpointHostOf}, which answers a NETWORK question and must never fall back
 *  to a label. */
export function hostLabel(baseUrl: string | null, providerLabel: string): string {
  return endpointHostOf(baseUrl) === null ? providerLabel : (URL.parse(baseUrl ?? "")?.host ?? providerLabel);
}

/** The host a connection's base URL dials, or `null` when the row has no URL (a hosted or in-process row). */
export function endpointHostOf(baseUrl: string | null): string | null {
  if (baseUrl === null) {
    return null;
  }
  const parsed = URL.parse(baseUrl);
  return parsed === null || parsed.hostname === "" ? null : parsed.hostname.toLowerCase();
}

/** The exact private-endpoint entry this URL can admit; IPv6 retains its authority brackets. */
export function endpointAuthorityOf(baseUrl: string | null): string | null {
  const parsed = baseUrl === null ? null : URL.parse(baseUrl);
  if (parsed === null || parsed.hostname === "") {
    return null;
  }
  const port = effectiveHttpPort(parsed.protocol, parsed.port);
  return port === null ? null : `${parsed.hostname.toLowerCase()}:${port}`;
}

/** Check only the exact written authority; resolved-address and CIDR decisions belong to the server. */
export function endpointNamedInAllowlist(authority: string, entries: readonly string[]): boolean {
  const target = authority.toLowerCase();
  return entries.some((entry) => entry.trim().toLowerCase() === target);
}

// The Connections pane's pure model (inference program §5.3a): the Model-roles ROW descriptors (the client
// owns the render order — a contract tuple's order is not a UI decision), the grouped provider picker
// (Hosted (key) · Your own server (URL) · Subscription · Built-in — never twelve options flat), and the
// per-row readouts. Labels come from the registry rows (`ProviderDef.label`), never a hand table.

import type {
  Capability,
  CapabilityRequirement,
  ProviderAuth,
  ProviderAvailability,
  ProviderDef,
  RoutableTask,
  Task,
  UnavailableCause,
} from "@orb/contracts/inference";
import { bindingTaskOf, canFund, EMBED_SPACE_DIMS, providerDisplayLabel, requirementMet, taskDef } from "@orb/contracts/inference";
import type { SelectItems, SelectOptionGroup } from "@orb/ui/select";

/** ONE CLAUSE of what a Model-roles slot demands of the connection bound to it, as the row's `Needs:` rail
 *  renders it: the user's word for the clause, the `CapabilityRequirement` `requirementMet` judges it by,
 *  and WHAT SKIPS when it is unmet.
 *
 *  Per CLAUSE, not per row, because a slot's consumers fail SEPARATELY (§5.3a): the Utility slot carries
 *  three tasks and a text-only model bound there still summarizes — it is captioning alone that goes
 *  silent. One merged verdict could not say which part.
 *
 *  The clause list is AUTHORED rather than folded out of `TASK_DEFS`, because two of the Utility slot's
 *  three consumers are not distinct tasks: `summarize` states no `requires` at all and captioning is a
 *  `structured`/`summarize` call that happens to carry an image. `roleRequirementsCoverTaskDefs` (the unit
 *  test's oracle, exported below) is what stops the authored list drifting BELOW the contract. */
interface RoleRequirement {
  readonly label: string;
  readonly requires: CapabilityRequirement;
  /** The consequence sentence for the unmet arm — §5.3a: a cannot-serve verdict states its REASON. */
  readonly unmet: string;
}

const NEEDS_PROSE: RoleRequirement = { label: "prose", requires: { output: ["text"] }, unmet: "summaries will skip" };
const NEEDS_STRUCTURED: RoleRequirement = { label: "structured JSON", requires: { structured: true }, unmet: "structured extraction will skip" };
const NEEDS_CAPTION_INPUT: RoleRequirement = { label: "image input", requires: { input: ["image"] }, unmet: "image captions will skip" };
const NEEDS_IMAGE_OUTPUT: RoleRequirement = { label: "image output", requires: { output: ["image"] }, unmet: "/imagine will say it can't run" };
const NEEDS_VECTOR_INPUT: RoleRequirement = {
  label: "image input",
  requires: { input: ["image"] },
  unmet: "picture search falls back to the captioned-text lens",
};
const NEEDS_VECTOR_WIDTH: RoleRequirement = {
  label: `${EMBED_SPACE_DIMS}-wide vectors`,
  requires: { dims: EMBED_SPACE_DIMS },
  unmet: "your index can't hold what it writes",
};

/** One Model-roles row's descriptor. */
export interface RoleRow {
  readonly task: RoutableTask;
  /** The role's NAME — the badge on a connection row, the picker's accessible name, the nav entry. Short
   *  by construction: it has to fit a pill beside five siblings. */
  readonly label: string;
  /** The row's HEADING in the section. `label` for five rows; §5.3a renames the Summarize slot to name its
   *  three consumers, because a user who reads "Summaries" and binds a text-only model breaks captioning. */
  readonly heading: string;
  readonly description: string;
  /** `true` for the vector-space rows: leaving them unset means search reads nothing, not "a default". */
  readonly optional: boolean;
  /** The `Needs:` rail. Empty where the slot demands nothing a user could get wrong by picking. */
  readonly requirements: readonly RoleRequirement[];
}

/** The rows keyed on `RoutableTask` — a new routable task is a `tsc` error here until it has a row. The
 *  Summarize slot is the UTILITY row (§5.3a): `structured` rides it, so its copy names all three consumers. */
const ROLE_ROWS: Record<RoutableTask, RoleRow> = {
  chat: {
    task: "chat",
    label: "Chat",
    heading: "Chat",
    description: "The main conversation model. Every turn you trigger runs on it.",
    optional: false,
    requirements: [],
  },
  summarize: {
    task: "summarize",
    label: "Utility model",
    heading: "Utility model — summaries, structured extraction, captions",
    description:
      "Point this at a cheap model; it needs background work allowed. Several things use this slot — memory digests, summaries, extraction and image captions.",
    optional: false,
    requirements: [NEEDS_PROSE, NEEDS_STRUCTURED, NEEDS_CAPTION_INPUT],
  },
  generateImage: {
    task: "generateImage",
    label: "Image generation",
    heading: "Image generation",
    description: "Renders pictures from prompts (the /imagine surface). Optional — leaving it unset means /imagine says so instead of failing.",
    optional: true,
    requirements: [NEEDS_IMAGE_OUTPUT],
  },
  embed: {
    task: "embed",
    label: "Text embedding",
    heading: "Text embedding",
    description: "Vectorizes text for search and memory. Changing it re-embeds your whole index.",
    optional: false,
    requirements: [NEEDS_VECTOR_WIDTH],
  },
  imageEmbed: {
    task: "imageEmbed",
    label: "Image embedding",
    heading: "Image embedding",
    description: "A multimodal embedder for searching images directly. Unset falls back to the captioned-text lens.",
    optional: true,
    requirements: [NEEDS_VECTOR_INPUT, NEEDS_VECTOR_WIDTH],
  },
  rerank: {
    task: "rerank",
    label: "Rerank",
    heading: "Rerank",
    description: "Reorders retrieved results by relevance.",
    optional: false,
    requirements: [],
  },
};

/** The pane's render order — the client's decision (side-eye 8 P3-1), pinned to be a permutation of the tuple. */
const ROLE_RENDER_ORDER: readonly RoutableTask[] = ["chat", "summarize", "generateImage", "embed", "imageEmbed", "rerank"];

/** The role rows in render order; a routable task missing from the order list is a `tsc`-visible gap in the test. */
export const ROLE_ROWS_ORDERED: readonly RoleRow[] = ROLE_RENDER_ORDER.map((task) => ROLE_ROWS[task]);

/** The user-facing Model-role labels a connection may serve. Non-routable tasks fold through their
 *  binding (`agent` → Chat, `structured` → Utility model), so schema task names never leak into copy. */
export function connectionRoleLabels(tasks: readonly Task[]): readonly string[] {
  const roles = new Set(tasks.map(bindingTaskOf));
  return ROLE_ROWS_ORDERED.filter((row) => roles.has(row.task)).map((row) => row.label);
}

/** The four picker groups, keyed on the provider row's `auth` (§5.3a) — the group label is the user's word. */
const AUTH_GROUP_LABELS: Record<ProviderAuth, string> = {
  apiKey: "Hosted (key)",
  endpoint: "Your own server (URL)",
  oauthToken: "Subscription",
  none: "Built-in",
};
const AUTH_GROUP_ORDER: readonly ProviderAuth[] = ["apiKey", "endpoint", "oauthToken", "none"];

/** `providers.available` → grouped Select items. An unavailable row (`runtime-missing` / `unavailable`)
 *  renders DISABLED with its reason as the gloss, never hidden (§5.3a: "`runtime-missing` is a cause, not a
 *  sentence a person can act on" — the reason IS the sentence). A plugin row names its plugin, so a manifest
 *  label can never pass as a built-in provider. */
export function providerPickerItems(available: readonly ProviderAvailability[]): SelectItems<string> {
  const groups: SelectOptionGroup<string>[] = [];
  for (const auth of AUTH_GROUP_ORDER) {
    const rows = available.filter((row) => row.provider.auth === auth);
    if (rows.length === 0) {
      continue;
    }
    groups.push({
      label: AUTH_GROUP_LABELS[auth],
      items: rows.map((row) => ({
        label: providerDisplayLabel(row.provider),
        value: row.provider.id,
        ...(row.available ? {} : { disabled: true, description: unavailableProviderCopy(row) }),
      })),
    });
  }
  return groups;
}

function unavailableProviderCopy(row: ProviderAvailability): string {
  return row.cause === "runtime-missing" ? "The Claude runtime isn't installed on this server." : "Not built on this server.";
}

/** The `api` control renders ONLY when the provider lists more than one (§5.3a — a one-option combobox can
 *  only be gotten wrong). */
export function showsApiControl(provider: ProviderDef | undefined): boolean {
  return provider !== undefined && provider.apis.length > 1;
}

const CHAT_API_LABEL_PAIRS = [
  ["chat-completions", "Chat Completions"],
  ["agent-sdk", "Agent SDK (Claude subscription)"],
  ["anthropic-messages", "Anthropic Messages"],
] as const;

/** The api-picker labels (the protocol axis), keyed on `CHAT_APIS` so a new member is a `tsc` error. */
export const CHAT_API_LABELS: Record<ProviderDef["apis"][number], string> = Object.fromEntries(CHAT_API_LABEL_PAIRS) as Record<
  ProviderDef["apis"][number],
  string
>;

/** A connection row's one-line identity — `<label> · <model>` when the label was not auto-minted from them. */
export function connectionSummary(row: { readonly label: string; readonly model: string }): string {
  return row.label.includes(row.model) ? row.label : `${row.label} · ${row.model}`;
}

/** The inline refusal a Model-roles row shows BEFORE writing a binding (§5.3a — the slot is the first
 *  enforcement point): a background task on a row with `allowBackground` off. `null` = bindable. */
export function bindRefusal(row: { readonly allowBackground: boolean }, task: RoutableTask): string | null {
  return canFund(row, task) ? null : "This connection doesn't allow background work — turn it on to use it here.";
}

// ═══ THE PERSISTED-RESOLVE READOUT (§5.3a) ════════════════════════════════════════════════════════════
// One sentence per role row saying what a turn uses TODAY, read from the PERSISTED `listBindings` view and
// never from form state — the 2026-08-01 incident (two hours of a NULL `roleDefaults` under a "Saved" chip)
// is what this readout exists for.
//
// FOUR ARMS, not two. §5.3a specifies the divergence sentence; rendering the mock found that `unset` and
// `blocked` are real states with real sentences, and they are the two the grey ring and the amber dot
// depend on. Building two and letting the other two fall through to arm 1 would make the row say a turn
// runs on something when nothing runs at all.
//
// THE DIVERGENCE CONDITION IS DRAFT-vs-PERSISTED, NEVER REQUEST-IN-FLIGHT. A `busDriven` write's read
// serves the PRE-write row between its 200 and the bus tick (`tests/client/data/_ct-stories.tsx`, the
// `createEntityMutation` `echo` seam), so a surface keying honesty on request state calls a SAVED
// selection unsaved for the length of that window. `draftConnectionId === undefined` means the picker has
// not been touched this mount, which is the only state that can never diverge.

/** The `listBindings` view as this model READS it — structural, so the pure lib never imports the trpc
 *  inference type (and the branded ids widen to `string` on the way in). */
export interface RoleBindingView {
  readonly binding: { readonly connectionId: string | null } | null;
  readonly resolved: { readonly connectionId: string; readonly capability: Capability } | null;
  readonly unavailableCause: UnavailableCause | null;
}

/** What the readout needs to know about the connection it is about to NAME. `{X}` is the connection's
 *  LABEL — never a registry id or a raw model id — because the readout's whole job is comparison against
 *  the picker beside it, and two vocabularies make that a translation exercise (side-eye F6). */
export interface RoleConnectionFacts {
  readonly label: string;
  /** `host[:port]` of the row's base URL, for the blocked arm's §5.3a sentence. `null` for a hosted row. */
  readonly host: string | null;
}

/** The four arms, as ONE discriminated union. It is deliberately NOT an exported `type` alias: a client
 *  feature's `lib/` is not a type home (`no-inline-types`), so the shape is DERIVED at every reader through
 *  `ReturnType<typeof roleReadout>` — one home, and a fifth arm is a `tsc` error at every consumer. */
type RoleReadout =
  | { readonly kind: "steady"; readonly connection: string }
  | { readonly kind: "divergent"; readonly connection: string }
  | { readonly kind: "unset" }
  | { readonly kind: "blocked"; readonly cause: string };

/** The clause after "Set, but not running — ", per cause. A mapped `Record` rather than a `switch`: biome
 *  reads every arm of a cross-module union switch as unreachable, and a map makes a new `UnavailableCause`
 *  member a `tsc` error here instead of a row with no words. */
const UNAVAILABLE_CLAUSES: Record<UnavailableCause, string> = {
  "no-connection": "the connection it pointed at is gone.",
  // The host arm below wins whenever the row HAS a URL; this is the hosted-provider fallback.
  "endpoint-unreachable": "the server isn't answering.",
  "runtime-missing": "the Claude runtime isn't installed on this server.",
  "background-refused": "this connection doesn't allow background work.",
  "requirement-unmet": "this model can't do this job.",
  unavailable: "this connection isn't available on this server.",
};

/** The honest silence for a refusal the server declined to name — never a raw cause code on screen. */
const UNAVAILABLE_UNKNOWN = "it isn't available right now.";

/** A resolved connection the `connection.list` read does not carry (a row removed between the two reads).
 *  Named rather than blank: a readout that says nothing reads as "a turn uses <empty>". */
const UNLISTED_CONNECTION = "a connection that is no longer listed";

function unavailableClause(cause: UnavailableCause | null, host: string | null): string {
  if (cause === "endpoint-unreachable" && host !== null) {
    return `can't reach ${host}.`;
  }
  return cause === null ? UNAVAILABLE_UNKNOWN : UNAVAILABLE_CLAUSES[cause];
}

/** The `host[:port]` of a base URL, for the blocked readout. String surgery rather than `URL`, because this
 *  module is pure and a readout has no business throwing on a half-typed URL the user saved. */
export function connectionHost(baseUrl: string | null): string | null {
  if (baseUrl === null) {
    return null;
  }
  const authority = baseUrl.replace(/^[a-z][a-z0-9+.-]*:\/\//iu, "").split("/")[0] ?? "";
  const host = authority.split("@").at(-1) ?? "";
  return host === "" ? null : host;
}

/** Which of the four sentences this row says, and with what value. */
export function roleReadout(args: {
  readonly view: RoleBindingView | null;
  /** The picker's current selection — `undefined` until the user touches it, `null` for "Not set". */
  readonly draftConnectionId: string | null | undefined;
  readonly factsOf: (connectionId: string) => RoleConnectionFacts | null;
}): RoleReadout {
  const resolved = args.view?.resolved ?? null;
  if (resolved !== null) {
    const facts = args.factsOf(resolved.connectionId);
    const connection = facts === null ? UNLISTED_CONNECTION : facts.label;
    const draft = args.draftConnectionId;
    return draft !== undefined && draft !== resolved.connectionId ? { kind: "divergent", connection } : { kind: "steady", connection };
  }
  const bound = args.view?.binding?.connectionId ?? null;
  if (bound === null) {
    return { kind: "unset" };
  }
  const facts = args.factsOf(bound);
  return { kind: "blocked", cause: unavailableClause(args.view?.unavailableCause ?? null, facts === null ? null : facts.host) };
}

/** The per-role status dot's ONE axis: WOULD A TURN RUN. A failed requirement is deliberately NOT this —
 *  a bound model that cannot read images still runs, and two of the Utility slot's three consumers work.
 *
 *  THE LABEL MAP IS THE AXIS. There is no separate exported union to keep in sync with it (and a client
 *  `lib/` may not home one, `no-inline-types`): a state with no accessible name is a state the amber dot
 *  could not be decided without, so the map's keys ARE the states, and `keyof typeof` is how every reader
 *  spells them. The blocked arm's words are REPEATED VERBATIM by the readout's blocked sentence. */
export const ROLE_STATUS_LABELS = {
  running: "Running",
  blocked: "Set, but not running",
  unset: "Not set",
} as const;

type RoleStatus = keyof typeof ROLE_STATUS_LABELS;

export function roleStatus(view: RoleBindingView | null): RoleStatus {
  if (view === null) {
    return "unset";
  }
  if (view.resolved !== null) {
    return "running";
  }
  return (view.binding?.connectionId ?? null) === null ? "unset" : "blocked";
}

/** One clause of the `Needs:` rail, judged. `met: null` = NOT JUDGED — nothing resolves for this role, so
 *  there is no capability to judge against and the rail states the requirement without a verdict. A
 *  cannot-serve verdict is MUTED with a `✗` and its reason, never destructive colour (§5.3a): a chat model
 *  that cannot embed is not broken. */
export interface RoleRequirementVerdict {
  readonly label: string;
  readonly met: boolean | null;
  readonly unmet: string;
}

export function roleRequirementVerdicts(row: RoleRow, capability: Capability | null): readonly RoleRequirementVerdict[] {
  return row.requirements.map((requirement) => ({
    label: requirement.label,
    met: capability === null ? null : requirementMet(capability, requirement.requires).ok,
    unmet: requirement.unmet,
  }));
}

/** THE ORACLE the unit test runs: every clause `TASK_DEFS` states for a task RIDING this slot must be
 *  covered by an authored `RoleRequirement`. The authored list may say MORE than the contract (captions are
 *  not their own task), never less — which is the only direction that can silently stop warning a user.
 * @public Test-anchored module surface; focused tests pin this production-local behavior. */
export function roleRequirementGaps(row: RoleRow, tasks: readonly Task[]): readonly string[] {
  const authored = row.requirements.map((requirement) => requirement.requires);
  const gaps: string[] = [];
  for (const task of tasks.filter((candidate) => bindingTaskOf(candidate) === row.task)) {
    const requires = taskDef(task).requires;
    if (requires === undefined) {
      continue;
    }
    for (const [axis, value] of Object.entries(requires)) {
      if (value !== undefined && !authored.some((clause) => JSON.stringify(clause[axis as keyof CapabilityRequirement]) === JSON.stringify(value))) {
        gaps.push(`${task}.${axis}`);
      }
    }
  }
  return gaps;
}

/** The connections a Model-roles row REFUSES only because the row's `allowBackground` is off — §5.3a's
 *  inline repair: the refusal plus the switch that resolves it, right there, because the slot is the FIRST
 *  enforcement point and a refusal with no adjacent remedy sends the user hunting for a switch nobody
 *  named. GATED ON THE ROLE HAVING NOTHING RUNNING: a role a turn already runs on has no problem to
 *  repair, and four background rows each offering the same switch would be noise, not help. */
export function backgroundRepairs<T extends { readonly id: string; readonly allowBackground: boolean; readonly tasks: readonly Task[] }>(args: {
  readonly row: RoleRow;
  readonly connections: readonly T[];
  readonly status: RoleStatus;
}): readonly T[] {
  if (args.status === "running") {
    return [];
  }
  return args.connections.filter((connection) => connection.tasks.includes(args.row.task) && !canFund(connection, args.row.task));
}

/** The Model-role NAMES "Use this connection for everything it can serve" would write — the menu item's
 *  gloss, so the sweep's consequence is knowable BEFORE the click (there is no default to fall back to).
 *  Mirrors the verb's own filter: every routable task the row can serve AND fund. */
export function sweepRoleLabels(connection: { readonly allowBackground: boolean; readonly tasks: readonly Task[] }): readonly string[] {
  return ROLE_ROWS_ORDERED.filter((row) => connection.tasks.includes(row.task) && canFund(connection, row.task)).map((row) => row.label);
}

/** The Model-role names a connection's REMOVAL would unset — the confirm's count and list (§5.3a/side-eye:
 *  the shipped description is correct and unquantified, and a user cannot decide without knowing whether
 *  they are breaking one role or five). Reads the persisted BINDINGS, not the row's capability. */
export function boundRoleLabels(
  connectionId: string,
  views: readonly { readonly task: RoutableTask; readonly binding: { readonly connectionId: string | null } | null }[],
): readonly string[] {
  const bound = new Set(views.filter((view) => view.binding?.connectionId === connectionId).map((view) => view.task));
  return ROLE_ROWS_ORDERED.filter((row) => bound.has(row.task)).map((row) => row.label);
}

/** "Chat, Utility model and Image generation" — an English list, so a count sentence reads as one. */
export function joinRoleLabels(labels: readonly string[]): string {
  if (labels.length <= 1) {
    return labels[0] ?? "";
  }
  return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1) ?? ""}`;
}

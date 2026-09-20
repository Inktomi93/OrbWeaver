// The Connections pane's pure model (inference program §5.3a) — the Model-roles rows are keyed on the contract's
// routable tasks (a new task is a compile error AND a pin here), the provider picker groups by the row's `auth`
// and never HIDES an unavailable provider (it disables it with its reason), and the readouts speak in the
// persisted read's words. Labels come from the registry rows, never a hand table.

import type { Capability, ProviderAvailability } from "@orb/contracts/inference";
import { BUILTIN_PROVIDERS, builtinProvider, CHAT_APIS, EMBEDDING_FLOOR, GENERATION_FLOOR, ROUTABLE_TASKS, TASKS } from "@orb/contracts/inference";
import {
  backgroundRepairs,
  bindRefusal,
  boundRoleLabels,
  CHAT_API_LABELS,
  connectionHost,
  connectionRoleLabels,
  connectionSummary,
  joinRoleLabels,
  providerPickerItems,
  ROLE_ROWS_ORDERED,
  ROLE_STATUS_LABELS,
  roleReadout,
  roleRequirementGaps,
  roleRequirementVerdicts,
  roleStatus,
  showsApiControl,
  sweepRoleLabels,
} from "../../../../../packages/client/src/features/credentials/lib/connections-model.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const OPENROUTER = "user_connection_model0000001";
const LOCAL = "user_connection_model0000002";

/** The two connections every readout/verdict case below names, by id, so a row's `{X}` is a LABEL. */
function factsOf(connectionId: string): { readonly label: string; readonly host: string | null } | null {
  if (connectionId === OPENROUTER) {
    return { label: "OpenRouter · Claude Opus 5", host: null };
  }
  return connectionId === LOCAL ? { label: "vLLM · Qwen3-32B", host: "127.0.0.1:8000" } : null;
}

function generation(over: Partial<typeof GENERATION_FLOOR> = {}): Capability {
  return { kind: "generation", generation: { ...GENERATION_FLOOR, ...over } };
}

function embedding(over: Partial<typeof EMBEDDING_FLOOR> = {}): Capability {
  return { kind: "embedding", embedding: { ...EMBEDDING_FLOOR, ...over } };
}

function boundTo(connectionId: string | null): { readonly connectionId: string | null } {
  return { connectionId };
}

function available(id: string, isAvailable = true, cause?: ProviderAvailability["cause"]): ProviderAvailability {
  const provider = builtinProvider(id);
  if (provider === undefined) {
    throw new Error(`no built-in provider ${id}`);
  }
  return { provider, available: isAvailable, ...(cause === undefined ? {} : { cause }) };
}

test("every routable task has exactly ONE Model-roles row, in the client's render order (a new task is caught here)", () => {
  const tasks = ROLE_ROWS_ORDERED.map((row) => row.task);
  expect(new Set(tasks).size).toBe(tasks.length);
  expect([...tasks].sort()).toEqual([...ROUTABLE_TASKS].sort());
  // Chat first, the utility row second — the two a fresh user must set before anything works.
  expect(tasks.slice(0, 2)).toEqual(["chat", "summarize"]);
});

test("the Utility row names all three consumers and every row carries a description", () => {
  const utility = ROLE_ROWS_ORDERED.find((row) => row.task === "summarize");
  expect(utility?.label).toBe("Utility model");
  expect(utility?.description).toMatch(/summar/iu);
  expect(utility?.description).toMatch(/caption/iu);
  for (const row of ROLE_ROWS_ORDERED) {
    expect(row.description.length).toBeGreaterThan(0);
  }
});

test("connection tasks fold to their six user-facing Model roles without leaking non-routable task names", () => {
  expect(connectionRoleLabels(["chat", "agent", "summarize", "structured", "generateImage", "embed", "imageEmbed", "rerank"])).toEqual([
    "Chat",
    "Utility model",
    "Image generation",
    "Text embedding",
    "Image embedding",
    "Rerank",
  ]);
});

test("the picker groups by the row's auth — Hosted (key) · Your own server (URL) · Subscription · Built-in — in that order", () => {
  const items = providerPickerItems(BUILTIN_PROVIDERS.map((provider) => ({ provider, available: true })));
  const labels = items.map((group) => ("items" in group ? group.label : ""));
  expect(labels).toEqual(["Hosted (key)", "Your own server (URL)", "Subscription", "Built-in"]);
  const hosted = items[0];
  if (hosted === undefined || !("items" in hosted)) {
    throw new Error("expected a grouped picker");
  }
  expect(hosted.items.map((item) => item.value)).toContain("openrouter");
  expect(hosted.items.map((item) => item.value)).not.toContain("vllm");
});

test("an unavailable provider is DISABLED with its reason, never hidden (runtime-missing is a cause, the gloss is the sentence)", () => {
  const items = providerPickerItems([available("openrouter"), available("claude-sub", false, "runtime-missing")]);
  const subscription = items.find((group) => "items" in group && group.label === "Subscription");
  if (subscription === undefined || !("items" in subscription)) {
    throw new Error("expected the Subscription group");
  }
  const claude = subscription.items.find((item) => item.value === "claude-sub");
  expect(claude?.disabled).toBe(true);
  expect(claude?.description).toMatch(/Claude runtime/u);
});

test("an empty group is omitted (never a heading over nothing)", () => {
  const items = providerPickerItems([available("openrouter")]);
  expect(items).toHaveLength(1);
});

test("the api control renders only when the provider lists more than one protocol", () => {
  // NO SHIPPED ROW lists two apis any more: `openrouter` was the last one, and `responses` was retired from
  // `CHAT_APIS` on 2026-09-20 (the OpenRouter Responses runner was demolished with `@openrouter/sdk` in
  // 146f71cd5 and never replaced). So the control renders for nothing built in — that is the pin. The >1 arm
  // stays proven on a synthetic row, which is the shape a plugin/admin row listing two would have.
  for (const row of BUILTIN_PROVIDERS) {
    expect(showsApiControl(row), `"${row.id}" must not raise a one-option protocol combobox`).toBe(false);
  }
  const openrouter = builtinProvider("openrouter");
  if (openrouter === undefined) {
    throw new Error("no built-in provider openrouter");
  }
  expect(showsApiControl({ ...openrouter, apis: ["chat-completions", "agent-sdk"] })).toBe(true);
  expect(showsApiControl(undefined)).toBe(false);
});

test("CHAT_API_LABELS is total over the protocol axis", () => {
  for (const api of CHAT_APIS) {
    expect(CHAT_API_LABELS[api]).toBeTruthy();
  }
});

test("bindRefusal: a background task on a row with allowBackground OFF is refused inline; a foreground task never is", () => {
  expect(bindRefusal({ allowBackground: false }, "summarize")).toMatch(/background/u);
  expect(bindRefusal({ allowBackground: true }, "summarize")).toBeNull();
  expect(bindRefusal({ allowBackground: false }, "chat")).toBeNull();
});

// ═══ THE FOUR READOUT ARMS ═════════════════════════════════════════════════════════════════════════════
// Each arm is a SENTENCE a user reads, and the value in it is the connection's LABEL — the same string the
// picker 40px away shows (side-eye F6: the shipped readout named the registry id and the raw model id, so
// the comparison the readout exists for was a translation exercise).

test("steady: a bound, resolving role names the connection in the PICKER's words, never a registry id", () => {
  const view = { binding: boundTo(OPENROUTER), resolved: { connectionId: OPENROUTER, capability: generation() }, unavailableCause: null };
  expect(roleReadout({ view, draftConnectionId: undefined, factsOf })).toEqual({ kind: "steady", connection: "OpenRouter · Claude Opus 5" });
  // The untouched picker is the one state that can never diverge, and a draft EQUAL to the persisted row
  // is not divergence either — "Not applied yet" about an applied pick is the lie this arm must not tell.
  expect(roleReadout({ view, draftConnectionId: OPENROUTER, factsOf }).kind).toBe("steady");
});

test("divergence keys on DRAFT-vs-PERSISTED and still names the PERSISTED row", () => {
  const view = { binding: boundTo(OPENROUTER), resolved: { connectionId: OPENROUTER, capability: generation() }, unavailableCause: null };
  // The user picked something else; the write has not reconciled through the bus yet. The sentence claims
  // divergence, and `{X}` is STILL what a turn uses — the 2026-08-01 ruling, intact under a new condition.
  expect(roleReadout({ view, draftConnectionId: LOCAL, factsOf })).toEqual({ kind: "divergent", connection: "OpenRouter · Claude Opus 5" });
  // Picking "Not set" diverges too — the role is not unbound until the write lands.
  expect(roleReadout({ view, draftConnectionId: null, factsOf }).kind).toBe("divergent");
});

test("unset: nothing bound says so, and an ABSENT view is unset rather than a blank", () => {
  expect(roleReadout({ view: null, draftConnectionId: undefined, factsOf })).toEqual({ kind: "unset" });
  expect(roleReadout({ view: { binding: null, resolved: null, unavailableCause: null }, draftConnectionId: undefined, factsOf })).toEqual({ kind: "unset" });
  // A binding whose connection was DELETED (SET NULL) is unset, not blocked — there is nothing to reach.
  expect(roleReadout({ view: { binding: boundTo(null), resolved: null, unavailableCause: "no-connection" }, draftConnectionId: undefined, factsOf })).toEqual({
    kind: "unset",
  });
});

test("blocked: a bound role that would not run states its cause, and the host arm is §5.3a's sentence", () => {
  const view = { binding: boundTo(LOCAL), resolved: null, unavailableCause: "endpoint-unreachable" } as const;
  expect(roleReadout({ view, draftConnectionId: undefined, factsOf })).toEqual({ kind: "blocked", cause: "can't reach 127.0.0.1:8000." });
  // A HOSTED row has no host to name — the sentence degrades rather than rendering "can't reach ."
  const hosted = { binding: boundTo(OPENROUTER), resolved: null, unavailableCause: "endpoint-unreachable" } as const;
  expect(roleReadout({ view: hosted, draftConnectionId: undefined, factsOf })).toEqual({ kind: "blocked", cause: "the server isn't answering." });
  // Every other cause is a SENTENCE, never the raw code — the shipped row rendered `endpoint-unreachable`
  // as a badge, which is a schema word on a user surface.
  for (const cause of ["runtime-missing", "background-refused", "requirement-unmet", "unavailable"] as const) {
    const readout = roleReadout({ view: { binding: boundTo(OPENROUTER), resolved: null, unavailableCause: cause }, draftConnectionId: undefined, factsOf });
    expect(readout.kind).toBe("blocked");
    expect(readout.kind === "blocked" ? readout.cause : "").not.toContain(cause);
  }
});

test("the blocked readout repeats the status dot's accessible name WORD FOR WORD", () => {
  // The property that makes the amber dot decidable with colour removed. The component renders
  // `${ROLE_STATUS_LABELS.blocked} — ${cause}`, so this pins the two channels to one string.
  expect(ROLE_STATUS_LABELS.blocked).toBe("Set, but not running");
  expect(ROLE_STATUS_LABELS).toEqual({ running: "Running", blocked: "Set, but not running", unset: "Not set" });
});

test("the status dot has ONE axis — would a turn run — and a failed requirement is not it", () => {
  const resolving = { binding: boundTo(OPENROUTER), resolved: { connectionId: OPENROUTER, capability: generation() }, unavailableCause: null };
  expect(roleStatus(resolving)).toBe("running");
  expect(roleStatus({ binding: boundTo(OPENROUTER), resolved: null, unavailableCause: "endpoint-unreachable" })).toBe("blocked");
  expect(roleStatus({ binding: boundTo(null), resolved: null, unavailableCause: "no-connection" })).toBe("unset");
  expect(roleStatus(null)).toBe("unset");
  // A text-only model bound to the Utility slot FAILS two of its three clauses and still RUNS: the dot is
  // green and the rail carries the verdict. Colouring the dot for this would say "broken" about a row that
  // summarizes perfectly well.
  const utility = ROLE_ROWS_ORDERED.find((row) => row.task === "summarize");
  expect(utility).toBeDefined();
  const verdicts = roleRequirementVerdicts(utility as (typeof ROLE_ROWS_ORDERED)[number], generation());
  expect(verdicts.filter((verdict) => verdict.met === false)).toHaveLength(2);
  expect(roleStatus(resolving)).toBe("running");
});

test("the Utility rail is THREE clauses, judged per clause, each with what SKIPS when it is unmet", () => {
  const utility = ROLE_ROWS_ORDERED.find((row) => row.task === "summarize") as (typeof ROLE_ROWS_ORDERED)[number];
  expect(utility.heading).toBe("Utility model — summaries, structured extraction, captions");
  expect(utility.requirements.map((requirement) => requirement.label)).toEqual(["prose", "structured JSON", "image input"]);

  // A cheap TEXT-ONLY model: prose passes, structured and captions fail — and they fail SEPARATELY.
  const cheap = roleRequirementVerdicts(utility, generation());
  expect(cheap.map((verdict) => verdict.met)).toEqual([true, false, false]);
  expect(cheap[2]?.unmet).toBe("image captions will skip");

  // The model §5.3a actually wants on this slot.
  const capable = roleRequirementVerdicts(utility, generation({ input: ["text", "image"], output: { ...GENERATION_FLOOR.output, structured: true } }));
  expect(capable.map((verdict) => verdict.met)).toEqual([true, true, true]);

  // NOTHING RESOLVES: the rail still STATES the requirement, with no verdict. A requirement the user
  // cannot see is the exact failure the rail exists to prevent, so it is never dropped for want of a model.
  expect(roleRequirementVerdicts(utility, null).map((verdict) => verdict.met)).toEqual([null, null, null]);
});

test("the vector rows judge width and image input through the same requirementMet the resolver uses", () => {
  const imageEmbed = ROLE_ROWS_ORDERED.find((row) => row.task === "imageEmbed") as (typeof ROLE_ROWS_ORDERED)[number];
  expect(imageEmbed.requirements.map((requirement) => requirement.label)).toEqual(["image input", "1024-wide vectors"]);
  expect(roleRequirementVerdicts(imageEmbed, embedding()).map((verdict) => verdict.met)).toEqual([false, true]);
  expect(roleRequirementVerdicts(imageEmbed, embedding({ input: ["text", "image"] })).map((verdict) => verdict.met)).toEqual([true, true]);
  // A NARROWER model never fits — padding invents coordinates (#1635), so the clause must read false.
  expect(roleRequirementVerdicts(imageEmbed, embedding({ dims: 768, input: ["text", "image"] })).map((verdict) => verdict.met)).toEqual([true, false]);
});

// THE ORACLE: the authored clause lists may say MORE than `TASK_DEFS` (captions are not their own task),
// never LESS — a contract requirement with no badge is a warning the user silently stops getting.
//
// ONE EXEMPTION, STATED RATHER THAN HIDDEN — and it REFUTES a premise. §5.3a and the step-3b mock both say
// "Chat has no `requires` block at all"; `TASK_DEFS` says otherwise, because `agent` rides the chat binding
// and requires `tools: true`. It is exempted rather than badged because `agent` is served ONLY by the
// `agent-sdk` wire (`TASK_DEFS.agent`), so on every other connection the clause is unreachable — and a `✗
// tools` on every ordinary chat model is exactly the wall of red about nothing actionable that the
// 2026-09-20 review struck off the editor's capability rail. The exemption is asserted EXACTLY, so a new
// chat-riding clause (or the removal of this one) reds here instead of silently widening the hole.
test("every TASK_DEFS requirement clause riding a slot is covered by that row's authored rail", () => {
  const agentRidesChat = ["agent.tools"];
  for (const row of ROLE_ROWS_ORDERED) {
    const expected = row.task === "chat" ? agentRidesChat : [];
    expect(roleRequirementGaps(row, TASKS), `${row.task} drops a contract clause`).toEqual(expected);
  }
});

test("the background repair offers the switch only where the role has nothing running", () => {
  const utility = ROLE_ROWS_ORDERED.find((row) => row.task === "summarize") as (typeof ROLE_ROWS_ORDERED)[number];
  const connections = [
    { id: OPENROUTER, allowBackground: false, tasks: ["chat", "summarize"] as const },
    { id: LOCAL, allowBackground: true, tasks: ["chat", "summarize"] as const },
  ];
  // Unset/blocked: the one row a background task cannot be bound to is offered its repair, by name.
  expect(backgroundRepairs({ row: utility, connections, status: "unset" }).map((row) => row.id)).toEqual([OPENROUTER]);
  expect(backgroundRepairs({ row: utility, connections, status: "blocked" }).map((row) => row.id)).toEqual([OPENROUTER]);
  // A role a turn already runs on has no problem to repair — four background rows each offering the same
  // switch would be noise, not help.
  expect(backgroundRepairs({ row: utility, connections, status: "running" })).toEqual([]);
  // A FOREGROUND row is never refused for funding, so it never offers the switch.
  const chat = ROLE_ROWS_ORDERED.find((row) => row.task === "chat") as (typeof ROLE_ROWS_ORDERED)[number];
  expect(backgroundRepairs({ row: chat, connections, status: "unset" })).toEqual([]);
});

test("the sweep's gloss names the roles it will write — and drops the ones it cannot fund", () => {
  expect(sweepRoleLabels({ allowBackground: true, tasks: ["chat", "summarize", "structured", "embed"] })).toEqual(["Chat", "Utility model", "Text embedding"]);
  // `useForEverything` SKIPS a background task on a row with the flag off ("everything it can serve"), so
  // the gloss must skip it too or the sentence promises bindings the verb will not write.
  expect(sweepRoleLabels({ allowBackground: false, tasks: ["chat", "summarize", "embed"] })).toEqual(["Chat"]);
});

test("the remove confirm counts the roles the connection is actually BOUND to, in render order", () => {
  const views = [
    { task: "chat", binding: boundTo(OPENROUTER) },
    { task: "summarize", binding: boundTo(LOCAL) },
    { task: "generateImage", binding: boundTo(OPENROUTER) },
    { task: "embed", binding: null },
  ] as const;
  expect(boundRoleLabels(OPENROUTER, views)).toEqual(["Chat", "Image generation"]);
  expect(boundRoleLabels(LOCAL, views)).toEqual(["Utility model"]);
  expect(boundRoleLabels("user_connection_nobody00001", views)).toEqual([]);
  expect(joinRoleLabels(["Chat", "Utility model", "Image generation"])).toBe("Chat, Utility model and Image generation");
  expect(joinRoleLabels(["Chat"])).toBe("Chat");
  expect(joinRoleLabels([])).toBe("");
});

test("connectionHost reads the authority out of a base URL without throwing on a half-typed one", () => {
  expect(connectionHost("http://127.0.0.1:8000/v1")).toBe("127.0.0.1:8000");
  expect(connectionHost("https://user:pass@api.example.com/v1")).toBe("api.example.com");
  expect(connectionHost("127.0.0.1:8000")).toBe("127.0.0.1:8000");
  expect(connectionHost(null)).toBeNull();
  expect(connectionHost("https://")).toBeNull();
});

test("connectionSummary avoids repeating the model when the auto-minted label already carries it", () => {
  expect(connectionSummary({ label: "OpenRouter · gpt-5", model: "gpt-5" })).toBe("OpenRouter · gpt-5");
  expect(connectionSummary({ label: "work key", model: "gpt-5" })).toBe("work key · gpt-5");
});

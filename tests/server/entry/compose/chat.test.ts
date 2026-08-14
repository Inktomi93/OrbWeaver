// The bridge's agent-sdk turn shaping (entry/compose/chat.ts — the PD-7 wiring): splitting the shaped
// history into the SESSION SEED + the PROMPT TAIL, and the legacy flatten fallback. Load-bearing: the
// split decides whether a turn resumes a session (seed + tail) or runs the one-off flattened shape
// (continue-mode / tool rows), and the tail join must match the backend comparator's user-run joiner.

import type { ChatId, ModelId, PersonaId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { TurnMessage, TurnRequest, TurnStreamChunk } from "@orb/server/domain/chat";
import { activePersonaIdFor, createRunChatTurnBridge, extractTrailingSystemRows, flattenAgentHistory, splitAgentHistory } from "@orb/server/entry/compose";
import type { ChatEvent, ChatResult, OrSkinTierModels, WarningCode } from "@orb/server/infra/providers";
import { AGENT_PROMPT_TAIL_JOINER } from "@orb/server/infra/providers";
import { describe } from "vitest";
import { expect, test } from "../../../support/fixtures.ts";

function row(role: TurnMessage["role"], text: string, name?: string): TurnMessage {
  const content: TurnMessage["content"] = [{ type: "text", text }];
  return name !== undefined ? { role, content, name } : { role, content };
}

describe("splitAgentHistory — seed + prompt tail", () => {
  test("splits at the last assistant row: prior turns seed, the trailing user rows are the prompt", () => {
    const split = splitAgentHistory([row("user", "hello"), row("assistant", "hi there"), row("user", "next question")]);
    expect(split).not.toBeNull();
    expect(split?.seed).toEqual([
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi there" },
    ]);
    expect(split?.prompt).toBe("next question");
  });

  test("a multi-row user tail joins with the contract joiner (the comparator's user-run rule)", () => {
    const split = splitAgentHistory([row("assistant", "greeting"), row("user", "part a"), row("user", "part b")]);
    expect(split?.prompt).toBe(`part a${AGENT_PROMPT_TAIL_JOINER}part b`);
    expect(split?.seed).toEqual([{ role: "assistant", content: "greeting" }]);
  });

  test("the wire `name` label is stamped into seed + prompt text (frames carry no name field)", () => {
    const split = splitAgentHistory([row("user", "hello", "Alice"), row("assistant", "hi", "Nyx"), row("user", "and then?", "Alice")]);
    expect(split?.seed).toEqual([
      { role: "user", content: "Alice: hello" },
      { role: "assistant", content: "Nyx: hi" },
    ]);
    expect(split?.prompt).toBe("Alice: and then?");
  });

  test("a FIRST turn (no assistant yet) is all-tail with an empty seed", () => {
    const split = splitAgentHistory([row("user", "opening line")]);
    expect(split?.seed).toEqual([]);
    expect(split?.prompt).toBe("opening line");
  });

  test("an assistant-FINAL history (continue-mode) returns null — the caller falls back to flatten", () => {
    expect(splitAgentHistory([row("user", "go"), row("assistant", "partial reply")])).toBeNull();
  });

  test("a tool row anywhere returns null (tools never ride the agent-sdk arm)", () => {
    expect(splitAgentHistory([row("user", "go"), row("tool", "result"), row("user", "next")])).toBeNull();
  });

  test("an empty-text tail returns null rather than sending a blank prompt", () => {
    expect(splitAgentHistory([row("assistant", "greeting"), row("user", "")])).toBeNull();
  });
});

describe("flattenAgentHistory — the fallback shape", () => {
  test("labels roles (with parenthesized names) and joins rows — the pre-PD-7 byte shape", () => {
    const prompt = flattenAgentHistory([row("user", "hello", "Alice"), row("assistant", "hi")]);
    expect(prompt).toBe("User (Alice): hello\n\nAssistant: hi");
  });
});

describe("extractTrailingSystemRows — the agent-sdk system-injection channel split", () => {
  test("splits trailing system rows off; their text joins for the dynamic hook; the remaining tail still splits cleanly", () => {
    const history = [row("user", "hello"), row("assistant", "hi"), row("user", "next"), row("system", "GM note A"), row("system", "GM note B")];
    const { rows, systemText } = extractTrailingSystemRows(history);
    expect(rows.map((r) => r.role)).toEqual(["user", "assistant", "user"]);
    expect(systemText).toBe(`GM note A${AGENT_PROMPT_TAIL_JOINER}GM note B`);
    // The volatile injection never enters the transcript, so the seed comparator matches next turn
    // (resume, not reseed) and the prompt stays the clean user tail.
    const split = splitAgentHistory(rows);
    expect(split?.prompt).toBe("next");
    expect(split?.seed.map((s) => s.role)).toEqual(["user", "assistant"]);
  });

  // F3 — the NUDGE-TAIL shape: SHAPE appends the group/CONTINUATION nudge as a trailing USER row AFTER the
  // depth-0 system reminder (`[…, assistant, system, user-nudge]`), so the system row is NOT tail-final. A pure
  // trailing-run scan missed it and let the reminder fall BARE into the prompt tail (unframed system authority
  // reaching the model as user content + entering the transcript → reseed churn). The lift must reach the
  // system row THROUGH the nudge tail; the nudge (a real user turn) stays in `rows`.
  test("F3: a system row with a trailing user NUDGE after it is still lifted (the nudge stays a user turn)", () => {
    const history = [row("user", "hello"), row("assistant", "hi"), row("system", "GM reminder"), row("user", "[Continue the conversation.]")];
    const { rows, systemText } = extractTrailingSystemRows(history);
    // The system band is lifted to the hook; the canon head + the nudge tail remain (nudge is a user turn).
    expect(rows.map((r) => r.role)).toEqual(["user", "assistant", "user"]);
    expect(systemText).toBe("GM reminder");
    // splitAgentHistory now sees a clean [user, assistant] seed + the NUDGE as the prompt — the reminder never
    // enters the prompt tail bare, and never enters the transcript (resume, not reseed).
    const split = splitAgentHistory(rows);
    expect(split?.prompt).toBe("[Continue the conversation.]");
    expect(split?.seed.map((s) => s.role)).toEqual(["user", "assistant"]);
    // The reminder text is NOT in the prompt (the F3 defect was it landing here bare).
    expect(split?.prompt).not.toContain("GM reminder");
  });

  // The multi-system + nudge composite (a squashed system run can precede the nudge too).
  test("F3: multiple system rows THEN a nudge — the whole system band lifts, nudge preserved", () => {
    const history = [row("user", "go"), row("assistant", "ok"), row("system", "note A"), row("system", "note B"), row("user", "[Continue the conversation.]")];
    const { rows, systemText } = extractTrailingSystemRows(history);
    expect(rows.map((r) => r.role)).toEqual(["user", "assistant", "user"]);
    expect(systemText).toBe(`note A${AGENT_PROMPT_TAIL_JOINER}note B`);
  });

  test("no trailing system rows → identity (systemText null, rows by reference)", () => {
    const history = [row("user", "hello")];
    const out = extractTrailingSystemRows(history);
    expect(out.systemText).toBeNull();
    expect(out.rows).toBe(history);
  });

  test("flattenAgentHistory labels a system row 'System' (the no-split fallback stays honest)", () => {
    expect(flattenAgentHistory([row("system", "note")])).toBe("System: note");
  });
});

// The FOREIGN resolver's trigger binding (Chat-Macro-Resolution §3/§4). TWO bugs are pinned here, both of the
// same species — a state the encoding could not express getting silently absorbed by a neighbour:
//   1. the resolver once coalesced `triggerPersonaId ?? personaIds.at(0)`, so the drain/auto callers' EXPLICIT
//      null ("no live triggering human, {{user}} binds to the chat anchor") became the presence-order-arbitrary
//      first present human;
//   2. INVITE-JOIN-NULL-PERSONA — a LIVE human whose seat holds no persona also had to send that same null, so
//      the fix for (1) handed them the ANCHOR: an invite-joined member's every line reached the model wearing
//      the HOST's persona name. The `human` arm now carries its own null and never reaches the anchor.
describe("activePersonaIdFor — the TurnTrigger binding", () => {
  const anchorPersonaId = castId<PersonaId>("persona_anchor");
  const triggerId = castId<PersonaId>("persona_trigger");
  const member = castId<UserId>("user_member");

  test("a human trigger binds to THAT human's persona — never the first present human", () => {
    expect(activePersonaIdFor({ trigger: { kind: "human", userId: member, personaId: triggerId }, anchorPersonaId })).toBe(triggerId);
  });

  test("a human with NO seat persona floors to nothing — NEVER the anchor (INVITE-JOIN-NULL-PERSONA)", () => {
    expect(activePersonaIdFor({ trigger: { kind: "human", userId: member, personaId: null }, anchorPersonaId })).toBeNull();
  });

  test("`none` (deferred drain / auto turn / any trigger-less read) binds to the ANCHOR, not a bystander", () => {
    expect(activePersonaIdFor({ trigger: { kind: "none" }, anchorPersonaId })).toBe(anchorPersonaId);
  });

  test("`none` with NO anchor is the honest nothing (the kit floor), never a bystander", () => {
    expect(activePersonaIdFor({ trigger: { kind: "none" }, anchorPersonaId: null })).toBeNull();
  });

  // 3. The RETIRED third state (owner ruling, 2026-08-07). There used to be an absent/`undefined` arm meaning
  //    "the trigger is unknown" (previews, host instruments) that resolved to `personaIds[0]` — the FIRST
  //    PRESENT human's persona, i.e. whoever joined first: nondeterministic across a join, and on a host
  //    instrument a cross-member read (a multi-human room's preview could show another member's persona as
  //    `{{user}}`). It is gone, and `trigger` is REQUIRED rather than merely thrown on: the binding cannot
  //    be omitted, so "no triggering human" has exactly one spelling — `{kind:"none"}` ⇒ the anchor. The
  //    room's `personaIds` list is no longer an input at all, which is why this function no longer takes it.
  test("the retired absent arm is UNREPRESENTABLE — `trigger` is required and takes no persona list", () => {
    // @ts-expect-error — omitting `trigger` no longer compiles (the retired `personaIds[0]` fallback).
    expect(() => activePersonaIdFor({ anchorPersonaId })).toBeDefined();
    // @ts-expect-error — the room's present-human persona ids are not an input to this binding any more.
    expect(activePersonaIdFor({ trigger: { kind: "none" }, anchorPersonaId, personaIds: [anchorPersonaId] })).toBe(anchorPersonaId);
  });
});

// The bridge's runner-WARNING carry (D41 no-silent-degrade, the READ end). The defect this pins: the bridge
// consumed only `reply`/`economics` off the runner's `ChatResult`, so every warning the runners put on
// `ChatResult.events` — `custom_parameters_ignored`, `tool_result_error_dropped`, every resolve-chat knob drop —
// died at this seam. Producer coverage existed (two runner suites); the READ side had none.
//
// The bridge CARRIES infra codes verbatim (the chat-vocabulary narrowing is the domain's, at
// `engine.ts` `toChatWarningCode`). Under test here: warnings become chunks at all, they land BEFORE the
// terminal `final` (which ends the drain), a repeat collapses, and non-warning runner events never leak in.
describe("createRunChatTurnBridge — the runner-warning carry", () => {
  /** FABRICATION-OK: a minimal successful `ChatResult` — only `events` is under test. */
  const baseResult = {
    reply: "ok",
    reasoning: "",
    reasoningRedacted: false,
    stopReason: null,
    terminalReason: null,
    finishReason: null,
    ttftMs: null,
    warmSpareClaimed: null,
    durationApiMs: null,
    apiErrorStatus: null,
    numTurns: 1,
    usage: {
      model: "test-model",
      tokensIn: 1,
      tokensOut: 1,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      cacheCreation5mTokens: null,
      cacheCreation1hTokens: null,
      reasoningTokens: null,
      contextWindow: null,
      maxOutputTokens: null,
      webSearchRequests: 0,
      costUsd: 0,
      costDetails: null,
      isByok: null,
    },
    rateLimit: null,
  } as const;

  const wireRequest: TurnRequest = {
    // FABRICATION-OK: minimal ResolvedCredential/capability doubles — the bridge reads only `connection.api`.
    connection: { api: "chat-completions", model: castId<ModelId>("test-model"), credential: {}, capability: {} } as unknown as TurnRequest["connection"],
    chatId: castId<ChatId>("chat_bridgewarn"),
    // FABRICATION-OK: the bridge reads only prompt.static + prompt.dynamic.
    prompt: { static: "sys", dynamic: "" } as unknown as TurnRequest["prompt"],
    history: [],
    intent: {},
    kind: "auto",
    ownerConsented: false,
    cacheBreakpointFromEnd: null,
  };

  /** Drive the real bridge over a leaf returning `events`, collecting every yielded chunk. */
  async function chunksFor(events: readonly ChatEvent[]): Promise<TurnStreamChunk[]> {
    const bridge = createRunChatTurnBridge({
      runChatTurn: (): Promise<ChatResult> => Promise.resolve({ ...baseResult, events }),
      getOrSkinTierModels: (): Promise<OrSkinTierModels> => Promise.resolve({ opus: "o", sonnet: "s", haiku: "h" }),
    });
    const out: TurnStreamChunk[] = [];
    for await (const chunk of bridge(wireRequest)) {
      out.push(chunk);
    }
    return out;
  }

  const warningEvent = (code: WarningCode): ChatEvent => ({ kind: "warning", at: 1000, code, message: `${code} happened` });

  test("a runner warning rides as a `warning` chunk, BEFORE the terminal `final`", async () => {
    const chunks = await chunksFor([warningEvent("custom_parameters_ignored")]);
    expect(chunks.map((c) => c.kind)).toEqual(["warning", "final"]);
    expect(chunks[0]).toEqual({ kind: "warning", code: "custom_parameters_ignored" });
  });

  test("a code with no chat twin still rides — the bridge carries, the DOMAIN decides what surfaces", async () => {
    // `sampling_knob_dropped` is a declared `toChatWarningCode` null (it needs its own CHAT_WARNING_CODES
    // member + owner-authored copy before it can toast — board row INFRA-WARN-DEAF), but that ruling belongs
    // to the domain: filtering it here would put chat's vocabulary decision in the composition root.
    const chunks = await chunksFor([warningEvent("sampling_knob_dropped")]);
    expect(chunks.map((c) => c.kind)).toEqual(["warning", "final"]);
  });

  test("a repeated code yields ONE chunk (one degrade, one notice)", async () => {
    const chunks = await chunksFor([warningEvent("custom_parameters_ignored"), warningEvent("custom_parameters_ignored")]);
    expect(chunks.filter((c) => c.kind === "warning")).toHaveLength(1);
  });

  // The DENOMINATOR carry (docs/design/streaming-shape-churn.md §7.5's phantom cost bug). `tokensOut` is a
  // SUM over the turn's model calls; `maxOutputTokens` is the PER-CALL ceiling. A live 4-call turn reported
  // `tokensOut:8192` against `maxOutputTokens:2048` and read as a backend ignoring the output cap — it was
  // a missing unit, not an ignored cap. The bridge is where the count crosses (`numTurns` → `modelCalls`),
  // so it is where the carry is pinned; without it the outcome ring can only ever record `null`.
  test("the provider's per-turn MODEL-CALL count rides the final economics as `modelCalls`", async () => {
    const bridge = createRunChatTurnBridge({
      runChatTurn: (): Promise<ChatResult> => Promise.resolve({ ...baseResult, numTurns: 4, events: [] }),
      getOrSkinTierModels: (): Promise<OrSkinTierModels> => Promise.resolve({ opus: "o", sonnet: "s", haiku: "h" }),
    });
    const chunks: TurnStreamChunk[] = [];
    for await (const chunk of bridge(wireRequest)) {
      chunks.push(chunk);
    }
    const final = chunks.find((c) => c.kind === "final");
    expect(final?.kind === "final" && final.economics.modelCalls).toBe(4);
  });

  test("non-warning runner events (rate_limit, model_downgrade) never become chunks", async () => {
    const chunks = await chunksFor([
      { kind: "rate_limit", at: 1000, status: "ok", rateLimitType: undefined, resetsAt: undefined, utilization: undefined, isUsingOverage: undefined },
      { kind: "model_downgrade", at: 1000, requested: "a", billed: ["b"] },
    ]);
    expect(chunks.map((c) => c.kind)).toEqual(["final"]);
  });

  // ── The prompt-cache depth FLOOR (AppSettings.promptCacheMinDepth, findings §5) ────────────────────────
  // The knob is layered HERE, at the one seam a domain depth becomes an infra request field. It is a floor
  // and only a floor: SHAPE's per-turn minimum still wins when it is deeper, and SHAPE's abort (a null
  // breakpoint — the prefix is mutating) is absolute, because a breakpoint on shifting bytes is a wasted
  // cache write in every case, at every depth.
  async function depthSentTo(cacheBreakpointFromEnd: number | null, promptCacheMinDepth?: () => number): Promise<number | undefined> {
    let seen: number | undefined;
    const bridge = createRunChatTurnBridge({
      runChatTurn: (req): Promise<ChatResult> => {
        seen = "historyCacheBreakpointFromEnd" in req ? req.historyCacheBreakpointFromEnd : undefined;
        return Promise.resolve({ ...baseResult, events: [] });
      },
      getOrSkinTierModels: (): Promise<OrSkinTierModels> => Promise.resolve({ opus: "o", sonnet: "s", haiku: "h" }),
      ...(promptCacheMinDepth === undefined ? {} : { promptCacheMinDepth }),
    });
    for await (const _chunk of bridge({ ...wireRequest, cacheBreakpointFromEnd })) {
      // drain
    }
    return seen;
  }

  test("no knob wired ⇒ SHAPE's depth rides VERBATIM (the byte-identical default)", async () => {
    expect(await depthSentTo(1)).toBe(1);
    expect(await depthSentTo(null)).toBeUndefined();
  });

  test("the floor 0 is the IDENTITY — an unset override cannot move any wire body", async () => {
    expect(await depthSentTo(1, () => 0)).toBe(1);
    expect(await depthSentTo(7, () => 0)).toBe(7);
  });

  test("a floor DEEPER than SHAPE's minimum wins (the owner's 'keep slots 0/1 volatile' case)", async () => {
    expect(await depthSentTo(1, () => 2)).toBe(2);
  });

  test("a floor SHALLOWER than SHAPE's minimum is IGNORED — the knob can never pin mutating bytes", async () => {
    expect(await depthSentTo(4, () => 2)).toBe(4);
  });

  test("SHAPE's ABORT is absolute — a null breakpoint stays absent however deep the floor is set", async () => {
    expect(await depthSentTo(null, () => 20)).toBeUndefined();
  });
});

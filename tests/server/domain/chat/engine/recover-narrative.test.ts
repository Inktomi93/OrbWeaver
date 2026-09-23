// engine/recover-narrative — the PROSE-LESS COMPLETION recovery pass (RECOVER, do not discard). Pins the
// NARROW gate (only prose-less-WITH-terminal-calls recovers), the pass-1 tool-call carry-over that is the
// whole point of the merge, the ask being APPENDED to an existing trailing user row rather than replacing it,
// and the tools-removed second wire call. Both passes run the REAL pipeline over a scripted `runChatTurn`
// (the injected provider seam) — nothing here is mocked.

import type { AssembleContext, ChatDeltaEvent, ChatReasoningPart, MessageView } from "@orb/contracts/chat";
import type { GenerationCapability } from "@orb/contracts/inference";
import type { UserIntent } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { resolveProseText } from "@orb/contracts/prose";
import type { Resolved } from "@orb/inference";
import type { AssetId, ChatId, ChatTurnId, MessageId, ModelId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import type { TurnRequest, TurnStreamChunk } from "../../../../../packages/server/src/domain/chat/contract/results.ts";
import { runTurnPipeline } from "../../../../../packages/server/src/domain/chat/engine/pipeline.ts";
import { resolveTurnNarrative } from "../../../../../packages/server/src/domain/chat/engine/recover-narrative.ts";
import type { ToolCallInput } from "../../../../../packages/server/src/domain/tool-use/contract/params.ts";
import { FROZEN_AT_MS } from "../../../../support/clock.ts";
import { makeCapability, makeGenerationCapability, makeResolved } from "../../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { testModelId } from "../../../../support/inference-identities.ts";

type PipelineArgs = Parameters<typeof runTurnPipeline>[0];
type PipelineResult = Awaited<ReturnType<typeof runTurnPipeline>>;
/** DERIVED from the pipeline's own terminal channel — `WireTool` is sealed inside `#infra/providers` and the
 *  domain never re-spells it (Tier-3b-Providers.md). */
type TerminalTool = NonNullable<PipelineArgs["terminalTools"]>[number];

const CHAT_ID = castId<ChatId>("chat_recovery");
const FIXTURE_HUMAN = castId<UserId>("user_fixture_human");

/** `tools` PRESENT + `silencesProse` unset ⇒ `coEmitsProseWithTools` is true, which is the capability gate the
 *  terminal channel attaches behind. A model that silences prose could never produce the recoverable shape. */
const CAPABILITY: GenerationCapability = makeGenerationCapability({
  output: { maxTokens: { min: 1, max: 8192 }, modalities: ["text"] },
  context: { window: 200_000 },
  tools: { parallel: true },
});

const CONNECTION: Resolved<"chat"> = makeResolved({ api: "chat-completions", model: castId<ModelId>("test-model"), capability: makeCapability(CAPABILITY) });

const TERMINAL_TOOL: TerminalTool = { name: "rpg_apply_state", description: "record the beat's state changes", parameters: { type: "object" } };
const TERMINAL_CALL: ToolCallInput = { toolCallId: "call_beat_1", name: "rpg_apply_state", arguments: '{"hp":-2}' };

const RECOVERY_ASK = resolveProseText("chat.recovery.narrativeContinuation", {});

/** A canon row double — the pipeline reads only these fields off one (see pipeline's header). */
function userRow(content: string): MessageView {
  // @orb-waive no-test-fabrication(unknown): the slim-double judgment `pipeline.test.ts` records for its own canon rows — a full Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  // `MessageView` carries a dozen read-model fields no code on this path reads.
  return {
    id: "message_fixture_1",
    role: "user",
    kind: "standard",
    content,
    excludedFromPrompt: false,
    characterId: null,
    personaId: null,
    authorUserId: FIXTURE_HUMAN,
  } as unknown as MessageView;
}

function ctxOf(): AssembleContext {
  return {
    character: { name: "Aria", description: "a bold knight" },
    promptConfig: DEFAULT_PROMPT_CONFIG,
    activePersona: { name: "Alex", description: "the user" },
    activePersonaUserId: FIXTURE_HUMAN,
    recentMessages: [],
  };
}

/** The injected provider seam, scripted PER PASS: call N of the turn replays script N. A pass the script does
 *  not cover throws rather than silently cycling (the tape doctrine — under-scripting must be LOUD). */
function scriptedPasses(passes: readonly (readonly TurnStreamChunk[])[]): { runChatTurn: PipelineArgs["runChatTurn"]; requests: TurnRequest[] } {
  const requests: TurnRequest[] = [];
  const runChatTurn: PipelineArgs["runChatTurn"] = (req: TurnRequest) => {
    const index = requests.length;
    requests.push(req);
    const chunks = passes[index];
    if (chunks === undefined) {
      throw new Error(`recover-narrative fixture: unscripted wire call #${index + 1}`);
    }
    return (async function* (): AsyncGenerator<TurnStreamChunk> {
      await Promise.resolve();
      for (const c of chunks) {
        yield c;
      }
    })();
  };
  return { runChatTurn, requests };
}

/** A completion that emits the terminal call and NO prose — the recoverable shape. */
const PROSELESS_PASS: readonly TurnStreamChunk[] = [
  { kind: "reasoning", text: "the beat is discharged by the calls" },
  { kind: "final", economics: { content: "", model: testModelId("test-model"), finishReason: "stop", toolCalls: [TERMINAL_CALL] } },
];

const prosePass = (text: string): readonly TurnStreamChunk[] => [
  { kind: "text", text },
  { kind: "final", economics: { content: text, model: testModelId("test-model"), finishReason: "stop" } },
];

function argsOf(over: Partial<PipelineArgs>, passes: readonly (readonly TurnStreamChunk[])[]): { args: PipelineArgs; requests: TurnRequest[] } {
  const { runChatTurn, requests } = scriptedPasses(passes);
  const deltas: ChatDeltaEvent[] = [];
  const args: PipelineArgs = {
    now: () => FROZEN_AT_MS,
    applyRegexReplace: (text, regex, replacer) => text.replace(regex, replacer),
    runChatTurn,
    resolveImageUrl: (ref) => Promise.resolve({ url: ref.kind === "asset" ? `https://cas.test/${ref.assetId}` : ref.url, media: "image" as const }),
    // §8.8: the `conversation` carry source. THROWS if reached — this harness runs the `off` rung.
    loadReasoningParts: (): Promise<ReadonlyMap<MessageId, readonly ChatReasoningPart[]>> =>
      Promise.reject(new Error("loadReasoningParts must not be reached")),
    // §6.7's origin set. THROWS if reached — this harness's canon carries no assistant-row `asset:` span, so
    // the lazy load must never fire (that no-read-without-cause property is the pin).
    loadInlineReplyAssetIds: (): Promise<ReadonlyMap<MessageId, ReadonlySet<AssetId>>> =>
      Promise.reject(new Error("loadInlineReplyAssetIds must not be reached")),
    assembleContext: ctxOf(),
    canon: [userRow("the party opens the door")],
    connection: CONNECTION,
    intent: {} satisfies UserIntent,
    kind: "send",

    chatId: CHAT_ID,
    onDelta: (d) => {
      deltas.push(d);
    },
    tools: null,
    attachedToolNames: [],
    toolRecurseLimit: 5,
    toolExecFrame: {
      runAsUserId: FIXTURE_HUMAN,
      triggeredBy: FIXTURE_HUMAN,
      chatId: CHAT_ID,
      membership: null,
      turnId: castId<ChatTurnId>("chat_turn_recovery"),
    },
    terminalTools: [TERMINAL_TOOL],
    ...over,
  };
  return { args, requests };
}

/** The wire text of one delivered history row. SHAPE emits multi-part content, so the trailing user row the
 *  recovery ask rides on is a span array whenever anything squashed onto it. */
function tailText(row: TurnRequest["history"][number] | undefined): string {
  const content: unknown = row?.content;
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return content.map((part: unknown) => (typeof part === "object" && part !== null && "text" in part ? String(part.text) : "")).join("");
}

/** Drive pass 1 through the real pipeline, then hand it to the recovery resolver — the production sequence. */
async function driveTurn(
  passes: readonly (readonly TurnStreamChunk[])[],
  over: Partial<PipelineArgs> = {},
): Promise<{ first: PipelineResult; result: PipelineResult; requests: TurnRequest[]; recoveries: PipelineResult[] }> {
  const { args, requests } = argsOf(over, passes);
  const first = await runTurnPipeline(args);
  const recoveries: PipelineResult[] = [];
  const result = await resolveTurnNarrative({
    chatId: CHAT_ID,
    pipelineArgs: args,
    first,
    onRecoveryOutcome: (r) => recoveries.push(r),
  });
  return { first, result, requests, recoveries };
}

describe("resolveTurnNarrative — the recoverable class", () => {
  test("recovers a prose-less turn: the narrative is pass 2's, the terminal calls stay pass 1's", async () => {
    const { first, result, requests, recoveries } = await driveTurn([PROSELESS_PASS, prosePass("The door groans open onto torchlight.")]);

    // Pass 1 really was the recoverable shape (non-vacuity control: the gate we are exercising actually opened).
    expect(first.content).toBe("");
    expect(first.terminalToolCalls).toEqual([TERMINAL_CALL]);

    expect(result.content).toBe("The door groans open onto torchlight.");
    // THE POINT OF THE MERGE: the state writes handed downstream are the ones the model actually made.
    expect(result.terminalToolCalls).toEqual([TERMINAL_CALL]);
    expect(requests).toHaveLength(2);
    expect(recoveries).toHaveLength(1);
  });

  test("the recovery pass drops the terminal tools — they already fired", async () => {
    const { requests } = await driveTurn([PROSELESS_PASS, prosePass("Torchlight.")]);

    const [pass1, pass2] = requests;
    expect(pass1?.tools?.terminal?.map((t) => t.name)).toEqual(["rpg_apply_state"]);
    // Absent, never `[]`: an empty array would still take the attach path on some wires.
    expect(pass2?.tools).toBeUndefined();
  });

  test("the ask is APPENDED to the turn's own trailing user row, never replacing it", async () => {
    const priorTail = "[Continue.]";
    const { requests } = await driveTurn([PROSELESS_PASS, prosePass("Torchlight.")], { appendUserTurn: priorTail });

    const tail = requests[1]?.history.at(-1);
    expect(tail?.role).toBe("user");
    // The turn's own synthetic row survives AND leads — a recovery pass that replaced it would silently drop
    // the instruction that shaped the turn (SHAPE squashes the tail onto the preceding user row, hence endsWith).
    expect(tailText(tail)).toContain(`${priorTail}\n\n${RECOVERY_ASK}`);
  });

  test("with no trailing user row of its own, the recovery pass sends the bare ask", async () => {
    const { requests } = await driveTurn([PROSELESS_PASS, prosePass("Torchlight.")]);

    const text = tailText(requests[1]?.history.at(-1));
    expect(text.endsWith(RECOVERY_ASK)).toBe(true);
    // Pass 1's tail carried nothing, so nothing but the canon row precedes the ask.
    expect(text).toBe(`the party opens the door\n\n${RECOVERY_ASK}`);
  });

  test("a recovery pass that is ALSO prose-less refuses the turn on the FIRST pass's result", async () => {
    const { first, result, requests, recoveries } = await driveTurn([PROSELESS_PASS, prosePass("")]);

    // The caller's empty-generation guard then reports the completion that discharged into tool calls.
    expect(result).toBe(first);
    expect(result.content).toBe("");
    // The doubled spend still happened, so it is still recorded.
    expect(requests).toHaveLength(2);
    expect(recoveries).toHaveLength(1);
  });
});

describe("resolveTurnNarrative — the NON-recoverable classes (no second wire call)", () => {
  test("a turn that produced prose is returned untouched", async () => {
    const { first, result, requests, recoveries } = await driveTurn([prosePass("The door opens.")]);

    expect(result).toBe(first);
    expect(requests).toHaveLength(1);
    expect(recoveries).toHaveLength(0);
  });

  test("prose-less with NO terminal channel (null) is a provider fault, not a discharged turn", async () => {
    // No terminal tools ⇒ `terminalToolCalls` is null: nothing landed to recover FROM.
    const { first, result, requests } = await driveTurn(
      [[{ kind: "final", economics: { content: "", model: testModelId("test-model"), finishReason: "stop" } }]],
      {
        terminalTools: undefined,
      },
    );

    expect(first.terminalToolCalls).toBeNull();
    expect(result).toBe(first);
    expect(requests).toHaveLength(1);
  });

  test("prose-less with an EMPTY terminal array is a quiet beat — genuinely empty, still refused", async () => {
    const quiet: readonly TurnStreamChunk[] = [{ kind: "final", economics: { content: "", model: testModelId("test-model"), finishReason: "stop" } }];
    const { first, result, requests } = await driveTurn([quiet]);

    expect(first.terminalToolCalls).toEqual([]);
    expect(result).toBe(first);
    expect(requests).toHaveLength(1);
  });
});

// engine/pipeline — the content-class wire plane and the CONTENT_CLASS_POLICY ↔ spanToWirePart binding.

import type { ChatInjection, MessageView } from "@orb/contracts/chat";
import { CONTENT_CLASS_POLICY, contentSpansToBlocks } from "@orb/contracts/chat";
import type { UserIntent } from "@orb/contracts/preset";
import { regexScriptSchema } from "@orb/contracts/regex";
import type { ContentSpan } from "@orb/kit/content";
import { tokenizeContent } from "@orb/kit/content";
import type { AssetId, MessageId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { executeRegexScripts } from "@orb/kit/regex";
import { makeCapability, makeGenerationCapability } from "@orb/testkit/node/factories/resolved-connection.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import type { TurnRequest } from "./_pipeline-support.ts";
import {
  __spanConvertsToNothingForTest,
  __spanToWirePartForTest,
  baseArgs,
  CAPABILITY,
  CONNECTION,
  ctxOf,
  historyText,
  readsPriorCache,
  rowOf,
  runTurnPipeline,
  userRow,
} from "./_pipeline-support.ts";

type PipelineResult = Awaited<ReturnType<typeof runTurnPipeline>>;

// ── The parity-plus §3.5 WIRE plane (hidden verbatim · card stub · M2 keep-last-X · §3.9 ordering) ──────
// These pins hold for ALL six connection modes by construction: they assert on `request.history`
// (`TurnMessage[]`), the ONE seam every backend consumes — the collapse happens BEFORE any per-backend
// wire vocabulary exists (`[[per-backend-wire-vocab-differs]]`: the COLLAPSE is wire-agnostic).

describe("runTurnPipeline — the §3 content-class wire plane", () => {
  // `cardKeepLastX: 0` is now stated EXPLICITLY on every stub assertion below. It used to be implicit: the
  // pipeline read `args.cardKeepLastX ?? 0`, so an absent value (a chat with no rpg game — the ONLY producer
  // of the field) silently became the window's strictest setting. That gave every non-rpg chat permanently
  // stubbed cards with no knob to change it. Absent now means NO window; `0` means keep none, and these
  // tests are about the `0` behaviour, so they say so.
  const stub0 = { cardKeepLastX: 0 } as const;
  const lieTag = '<lie character="Zandik" type="location" truth="He is in the crypt" reason="the heist"/>';
  const cardFence = ':::card title="Terminal"\n<div style="color:red">multi-KB html blob</div>\n:::';

  // #1434 — CONVERT runs before FIT. The conversion is LOSSY on purpose, so pricing the pre-conversion
  // bytes charged the budget for content the provider never receives: a stored card's multi-KB body cost
  // the fit thousands of tokens and then collapsed to `[card: title]` on the way out, evicting real turns
  // to make room for something already deleted — and `fitUsedTokens` (the managed-compaction trigger)
  // reported the phantom weight. The existing card tests prove the collapse; none of them ever combined it
  // with a constrained window, which is the only place the ordering is observable.
  test("#1434: a stubbed card is priced by its STUB, so a tight window keeps the older turns it used to evict", async () => {
    const huge = ':::card title="c1"\n<div>'.concat("x".repeat(200_000), "</div>\n:::");
    const canon = [userRow(huge), rowOf("assistant", "the reply that matters"), userRow("and the follow-up"), rowOf("assistant", "the newest beat")];
    // A window that comfortably fits four short turns and could never fit 200KB of html.
    const capability = makeGenerationCapability({ output: { maxTokens: { min: 1, max: 8192 }, modalities: ["text"] }, context: { window: 8192 } });
    const result = await runTurnPipeline(
      baseArgs({
        canon,
        ...stub0,
        connection: { ...CONNECTION, capability: makeCapability(capability) },
        intent: { maxOutputTokens: 128 } satisfies UserIntent,
      }).args,
    );
    // Nothing was evicted, and the card is on the wire as its stub — the two halves of the same claim.
    expect(result.droppedCount).toBe(0);
    expect(result.request.history).toHaveLength(canon.length + 1); // + SHAPE's trailing continuation synthetic
    expect(result.request.history[0]?.content).toEqual([{ type: "text", text: "[card: c1]" }]);
    // …and the boundary the fit reports is the honest one: nothing fell out of context.
    expect(result.contextBoundaryMessageId).toBeNull();
    // `fitUsedTokens` describes the ACTUAL request: it must not carry the 200KB the wire never saw.
    expect(result.fitUsedTokens).toBeLessThan(8192);
  });

  // #1438 — every span in the row is a `choices` span, the handler drops all of them, and with no dropped
  // MEDIA to placeholder the row fell through to `{type:"text", text:""}`. Providers reject empty messages,
  // and shipping one also contradicts the fence's own intent to remove the block. The existing choices tests
  // all wrap the fence in prose, so the all-choices row was uncovered.
  test("#1438: a CHOICES-ONLY row does not reach the provider as an empty text message", async () => {
    const choicesOnly = ":::choices\n1. Enter the crypt\n2. Flee\n:::";
    const canon = [rowOf("assistant", choicesOnly), userRow("I flee."), rowOf("assistant", "You run.")];
    const result = await runTurnPipeline(baseArgs({ canon }).args);
    expect(result.request.history.map((m) => m.content)).not.toContainEqual([{ type: "text", text: "" }]);
    // 3 canon rows − the emptied one + SHAPE's trailing continuation synthetic (the tail is never dropped).
    expect(result.request.history).toHaveLength(3);
    // The surrounding turns are untouched — this drops the empty row, never the conversation around it.
    expect(result.request.history.map((m) => m.content)).toContainEqual([{ type: "text", text: "You run." }]);
  });

  // SHAPE judges a system row's slot by its neighbours; a neighbour that converts to nothing on the wire is not
  // one. The choices-only assistant row is dropped after SHAPE, so a note kept between it and a user row would
  // reach the direct wire as `[user, system, user]`.
  test("a system note is judged against the rows the wire delivers — a choices-only neighbour does not count", async () => {
    const choicesOnly = ":::choices\n1. Enter the crypt\n2. Flee\n:::";
    const canon = [rowOf("assistant", "You stand at the gate."), userRow("I look around."), rowOf("assistant", choicesOnly), userRow("I flee.")];
    const note: ChatInjection = { position: "in_chat", depth: 2, role: "system", content: "Author's note: keep it tense." };
    const { args } = baseArgs({
      canon,
      connection: {
        ...CONNECTION,
        capability: makeCapability({
          ...CAPABILITY,
          turns: { assistantPrefill: false, midConversationSystem: true, historySystemRows: true, roleHandlingFloor: "slotted", explicitPromptCache: false },
        }),
      },
      assembleContext: ctxOf({ chatInjections: [note] }),
    });
    const history = (await runTurnPipeline(args)).request.history;
    const text = (m: TurnRequest["history"][number]): string => m.content.map((p) => (p.type === "text" ? p.text : "")).join("");
    const slots = history.flatMap((m, i) => (m.role === "system" ? [`${history[i - 1]?.role}>${history[i + 1]?.role}`] : []));
    expect(slots.filter((slot) => slot !== "user>assistant")).toEqual([]);
    expect(history.some((m) => text(m).includes("Author's note: keep it tense."))).toBe(true);
  });

  // #1543 — GREEN BEFORE THE FIX, and the label is the finding. The §8 breakpoint is an OFFSET FROM THE
  // END, so a mid-array drop CAN in principle move it off the row SHAPE measured. On this path it cannot:
  // `computeHistoryBreakpoint` sets `stableCount = withTail.length - 1`, so the stable prefix is everything
  // but the turn's tail — and the empty-row drop never removes the tail, so every row it can remove is
  // INSIDE the prefix and shortens the array and the prefix by the same one. The offset commutes.
  // `shiftBreakpoint` is kept because that argument is a property of ONE branch: the `merges:false` arm
  // counts the prefix by filtering blank-content rows, which can push `offsetFromEnd` above 1 and put a
  // droppable row in the tail region. So this is a FENCE on the commuting property, not a defect proof —
  // if a future SHAPE change raises the offset, this is the test that starts to matter.
  test("#1543 FENCE: dropping an empty choices row leaves the cache breakpoint addressing the same boundary", async () => {
    const choicesOnly = ":::choices\n1. Enter the crypt\n2. Flee\n:::";
    const withEmpty = [rowOf("assistant", "the settled past"), userRow("a beat"), rowOf("assistant", choicesOnly), userRow("I flee.")];
    // The SAME conversation with the choices row's body replaced by prose — same row count, same roles, so
    // SHAPE measures the same stable prefix and the only difference is whether a row converts to nothing.
    const withProse = [rowOf("assistant", "the settled past"), userRow("a beat"), rowOf("assistant", "she waits"), userRow("I flee.")];
    const run = async (canon: MessageView[]): Promise<{ offset: number | null; length: number; history: TurnRequest["history"] }> => {
      const result = await runTurnPipeline(baseArgs({ canon }).args);
      return { offset: result.cacheBreakpointFromEnd, length: result.request.history.length, history: result.request.history };
    };
    const dropped = await run(withEmpty);
    const intact = await run(withProse);

    // The control: the prose run keeps every row, so its offset is SHAPE's own number, untouched.
    // (A canon ending on a USER row needs no continuation nudge, so the wire array is the canon exactly.)
    expect(intact.length).toBe(withProse.length);
    // The dropped run is exactly one row shorter…
    expect(dropped.length).toBe(intact.length - 1);
    // The control must be a REAL placement, or this pin would compare two nulls and prove nothing.
    expect(typeof intact.offset).toBe("number");
    // The dropped row came out of the stable PREFIX, so the array and the prefix shrank together and the
    // offset is unchanged — and it still addresses the same LOGICAL boundary (the turn's tail).
    expect(dropped.offset).toBe(intact.offset);
    // The receipt that the offset means what it says: it addresses a row that exists, and that row is the
    // one after the stable prefix — the last row, which is the turn's own tail on both runs.
    expect(dropped.offset ?? 0).toBeLessThanOrEqual(dropped.length);
    expect(dropped.history.at(-(dropped.offset ?? 1))?.content).toEqual([{ type: "text", text: "I flee." }]);
  });

  test("a hidden tag rides the wire VERBATIM ({wire: full} — the model keeps its own lie), byte-identical single text part", async () => {
    const body = `He nods. ${lieTag} "Nothing," he says.`;
    const { args } = baseArgs({ canon: [userRow(body)] });
    const result = await runTurnPipeline(args);
    expect(result.request.history.at(-1)?.content).toEqual([{ type: "text", text: body }]);
  });

  test("a card collapses to the deterministic stub ({wire: stub}) — zero html bytes on the wire, same bytes across assemblies", async () => {
    const body = `Look at this:\n${cardFence}\ndone.`;
    const first = await runTurnPipeline(baseArgs({ canon: [userRow(body)], ...stub0 }).args);
    const second = await runTurnPipeline(baseArgs({ canon: [userRow(body)], ...stub0 }).args);
    const part = first.request.history.at(-1)?.content;
    expect(part).toEqual([{ type: "text", text: "Look at this:\n[card: Terminal]\ndone." }]);
    expect(JSON.stringify(first.request.history)).not.toContain("multi-KB");
    // Cache-stability: the collapse is byte-deterministic across assemblies (§3.7).
    expect(second.request.history).toEqual(first.request.history);
  });

  test("an UNTERMINATED card in committed canon stubs like any other — a truncated blob never rides the wire raw", async () => {
    // The wire build tokenizes with `committed: true` (the fitted history is stored canon, not the live
    // stream), so the RV-2 truncated-generation class — a card the model never closed — collapses to the
    // same deterministic stub instead of shipping its half-written markup on every subsequent turn.
    const truncated = ':::card title="Ashfell Night Market"\n<div style="font-family: multi-KB html blob';
    const result = await runTurnPipeline(baseArgs({ canon: [userRow(`Look:\n${truncated}`)], ...stub0 }).args);
    expect(result.request.history.at(-1)?.content).toEqual([{ type: "text", text: "Look:\n[card: Ashfell Night Market]" }]);
    expect(JSON.stringify(result.request.history)).not.toContain("multi-KB");
  });

  test("NO rpg game (cardKeepLastX absent) ⇒ NO window: every card rides the wire WHOLE", async () => {
    // The regression pin for a real defect: `cardKeepLastX` is contributed ONLY by an rpg game's gather, and
    // the pipeline read it as `?? 0` — so an ordinary chat, which supplies nothing, silently inherited the
    // window's STRICTEST setting. Every card in its history collapsed to `[card: title]` on every turn,
    // permanently, with no knob anywhere to change it. A budget/cache tradeoff nobody opted into.
    const body = `Look at this:\n${cardFence}\ndone.`;
    const result = await runTurnPipeline(baseArgs({ canon: [userRow(body)] }).args);
    expect(result.request.history.at(-1)?.content).toEqual([{ type: "text", text: body }]);
    // The html really is on the wire — the stub is absent, not merely relabelled.
    expect(JSON.stringify(result.request.history)).toContain("multi-KB");
  });

  test("M2 keep-last-X: X=0 stubs every card; X=1 keeps only the NEWEST full; X=2 holds a third card until two can stub", async () => {
    const cardBody = (n: number): string => `:::card title="c${n}"\n<p>blob${n}</p>\n:::`;
    // Alternating roles so SHAPE keeps three separate rows (same-role runs squash into one body).
    const canon = [userRow(cardBody(1)), rowOf("assistant", cardBody(2)), userRow(cardBody(3))];
    const textsOf = (history: readonly TurnRequest["history"][number][]): string[] =>
      history.map((m) => m.content.map((p) => (p.type === "text" ? p.text : "")).join(""));

    const x0 = await runTurnPipeline(baseArgs({ canon, ...stub0 }).args);
    expect(textsOf(x0.request.history)).toEqual(["[card: c1]", "[card: c2]", "[card: c3]"]);

    const x1 = await runTurnPipeline(baseArgs({ canon, cardKeepLastX: 1 }).args);
    expect(textsOf(x1.request.history)).toEqual(["[card: c1]", "[card: c2]", cardBody(3)]);

    // The window stubs whole chunks of X, so one card past X stays full until a second one joins it.
    const x2 = await runTurnPipeline(baseArgs({ canon, cardKeepLastX: 2 }).args);
    expect(textsOf(x2.request.history)).toEqual([cardBody(1), cardBody(2), cardBody(3)]);
  });

  // A stored card that leaves the keep-last-X window rewrites its row, and that row sits above the cache
  // breakpoint. The window stubs whole chunks of X cards, so the rewrite lands once per X card-bearing turns.
  describe("the keep-last-X window across card-bearing turns", () => {
    const turns = 8;
    const cardBody = (n: number): string => `:::card title="c${n}"\n<p>blob${n}</p>\n:::`;
    const all = Array.from({ length: turns }, (_, k) => [userRow(`u${k}`), rowOf("assistant", cardBody(k))]).flat();
    const runTurns = async (cardKeepLastX: number): Promise<PipelineResult[]> => {
      const results: PipelineResult[] = [];
      for (let t = 1; t <= turns; t += 1) {
        results.push(await runTurnPipeline(baseArgs({ canon: [...all.slice(0, 2 * t), userRow(`u${t}`)], cardKeepLastX }).args));
      }
      return results;
    };
    const fullCards = (result: PipelineResult): number[] =>
      Array.from({ length: turns }, (_, n) => n).filter((n) => historyText(result.request).includes(`<p>blob${n}</p>`));
    const prefixBreaks = (results: readonly PipelineResult[]): number[] =>
      results.slice(1).flatMap((next, i) => (readsPriorCache(results[i] ?? next, next) ? [] : [i + 2]));

    test("X=2 keeps the newest two cards whole and stubs older cards two at a time", async () => {
      const results = await runTurns(2);
      // Turns 4, 6 and 8 each stub two cards; no other turn rewrites the cached prefix.
      expect({ full: results.map(fullCards), breaks: prefixBreaks(results) }).toEqual({
        full: [[0], [0, 1], [0, 1, 2], [2, 3], [2, 3, 4], [4, 5], [4, 5, 6], [6, 7]],
        breaks: [4, 6, 8],
      });
    });

    test("X=0 stubs every stored card and never rewrites the cached prefix", async () => {
      const results = await runTurns(0);
      expect(results.map(fullCards)).toEqual(Array.from({ length: turns }, () => []));
      expect(prefixBreaks(results)).toEqual([]);
    });
  });

  // A card the ASSEMBLY authored this turn is INSTRUCTION, not stored content: it must reach the model
  // whole at every keep value, and must not consume the window. The live defect this pins: the rpg
  // card-teach block embeds a literal `:::card` worked example, so at the default `cardKeepLastX = 0` the
  // wire seam collapsed the model's own teaching example to `[card: …]` before sending it — deleting the
  // one measured intervention that pins the opener's exact bytes, on every game. At keepLastX >= 1 it
  // failed the other way: the example rides the tail, so it WON the window and stubbed the real cards.
  test("a card in an INJECTED (id-less) row never stubs and never consumes the keep-last-X window", async () => {
    const cardBody = (n: number): string => `:::card title="c${n}"\n<p>blob${n}</p>\n:::`;
    const teach = `render one like this:\n${cardBody(9)}`;
    const canon = [userRow(cardBody(1)), rowOf("assistant", cardBody(2))];
    const injections: ChatInjection[] = [{ position: "in_chat", depth: 0, role: "system", content: teach }];
    const textOf = (req: TurnRequest): string => historyText(req);

    // X=0 — every STORED card stubs, and the authored example still rides whole.
    const x0 = await runTurnPipeline(baseArgs({ canon, assembleContext: ctxOf({ chatInjections: injections }), ...stub0 }).args);
    expect(textOf(x0.request)).toContain(cardBody(9));
    expect(textOf(x0.request)).toContain("[card: c1]");
    expect(textOf(x0.request)).toContain("[card: c2]");

    // X=1 — the authored example does NOT eat the slot: the newest STORED card still rides whole.
    const x1 = await runTurnPipeline(baseArgs({ canon, cardKeepLastX: 1, assembleContext: ctxOf({ chatInjections: injections }) }).args);
    expect(textOf(x1.request)).toContain(cardBody(9));
    expect(textOf(x1.request)).toContain(cardBody(2));
    expect(textOf(x1.request)).toContain("[card: c1]");
  });

  test("an unknown-directive rides VERBATIM ({wire: full} — the transcript is honest)", async () => {
    const body = ':::teleport to="crypt"\nnow\n:::';
    const result = await runTurnPipeline(baseArgs({ canon: [userRow(body)] }).args);
    expect(result.request.history.at(-1)?.content).toEqual([{ type: "text", text: body }]);
  });

  test("P5: a `:::choices` fence in a PRIOR message is STRIPPED from the model wire ({wire: drop}) — unselected options stop piling up on later turns, but the surrounding prose survives", async () => {
    // The assistant offered a CYOA menu last turn; the reader picked one (which became a real user turn).
    // On this turn's assembly the fence must be gone from the model wire — only the prose around it rides.
    const choicesFence = ":::choices\n1. Enter the crypt\n2. Flee\n:::";
    const body = `You reach the door.\n\n${choicesFence}\n\nWhat now?`;
    const result = await runTurnPipeline(baseArgs({ canon: [userRow(body)] }).args);
    const wire = JSON.stringify(result.request.history);
    expect(wire).not.toContain("Enter the crypt");
    expect(wire).not.toContain(":::choices");
    // The prose on either side of the dropped fence survives (collapsed, the empty fence-neighbours join).
    expect(wire).toContain("You reach the door.");
    expect(wire).toContain("What now?");

    // The reading-surface projection is UNCHANGED (reading:"show") — the reader still gets the choice block.
    const blocks = contentSpansToBlocks(tokenizeContent(body));
    expect(blocks.some((b) => b.kind === "choices")).toBe(true);
  });

  test("squash parity (§3.7): a `\\n\\n`-joined multi-body string tokenizes whole — the tag/fence survive the join", async () => {
    // SHAPE's squash joins bodies with `\n\n` BEFORE tokenization; emulate the joined body directly.
    const joined = `first reply ${lieTag}\n\n${cardFence}`;
    const result = await runTurnPipeline(baseArgs({ canon: [userRow(joined)], ...stub0 }).args);
    expect(result.request.history.at(-1)?.content).toEqual([{ type: "text", text: `first reply ${lieTag}\n\n[card: Terminal]` }]);
  });

  test("§3.9 ordering pin: a prompt-side regex runs on the FULL card bytes upstream; the stub replaces them at the wire seam below it", async () => {
    // The string-body regex passes (AI_OUTPUT etc.) run in assembly, UPSTREAM of toContentParts — a
    // promptOnly script sees the full card body (its contract), and the stub is the wire-transport
    // collapse below it. Emulate the upstream pass exactly as assembly composes it.
    const body = `alpha prose\n${cardFence}`;
    const processed = executeRegexScripts({
      text: body,
      scripts: [
        regexScriptSchema.parse({
          id: mintTypeId(ID_PREFIX.regexScript),
          name: "s",
          updatedAt: 1_700_000_000_000,
          enabled: true,
          placement: ["AI_OUTPUT"],
          findRegex: "alpha",
          replaceString: "beta",
          promptOnly: true,
        }),
      ],
      placement: "AI_OUTPUT",
      ctx: { char: "Aria", user: "Alex", persona: "", scenario: "", env: {} },
    });
    // The regex saw + rewrote the non-card text; the card bytes were visible to it (no pre-collapse).
    expect(processed).toContain("beta prose");
    expect(processed).toContain("multi-KB");
    const result = await runTurnPipeline(baseArgs({ canon: [userRow(processed)], ...stub0 }).args);
    // Downstream, the wire stubs the card and keeps the regex's effect on the surrounding prose.
    expect(result.request.history.at(-1)?.content).toEqual([{ type: "text", text: "beta prose\n[card: Terminal]" }]);
  });
});

// ── The CONTENT_CLASS_POLICY ↔ spanToWirePart binding (content-class wire memory: table + hardcoded
// dispatch, edit BOTH — this reds if a policy row's `wire` plane and the dispatch disagree). `image` is
// exempted: its policy row (`wire:"drop"`) covers only the deliberate-user-attachment arm; every other
// embedded image is DISPLAY-ONLY and never rides the wire plane at all (see `WIRE_PART_HANDLERS`'s `image`
// comment in `pipeline.ts`).
describe("spanToWirePart — CONTENT_CLASS_POLICY binding", () => {
  // Empty inline-reply set = §6.7's fence CLOSED: no assistant-row asset rides. The relaxation's own
  // both-directions proof lives in `tests/server/domain/chat/substrate/wire-history.test.ts`.
  const wireEnv = {
    visionOk: true,
    videoOk: false,
    resolveImageUrl: async () => null,
    fullCards: new Set<ContentSpan>(),
    inlineReply: new Map<MessageId, ReadonlySet<AssetId>>(),
    contentSignatures: undefined,
  };
  const wireRow = { role: "assistant" as const, userAuthored: false, messageId: undefined };

  test('wire:"full" classes (text/hidden/unknown-directive) ride VERBATIM', async () => {
    expect(CONTENT_CLASS_POLICY.text.wire).toBe("full");
    expect(CONTENT_CLASS_POLICY.hidden.wire).toBe("full");
    expect(CONTENT_CLASS_POLICY["unknown-directive"].wire).toBe("full");

    const textPart = await __spanToWirePartForTest({ kind: "text", text: "hello" }, wireEnv, wireRow);
    expect(textPart).toEqual({ type: "text", text: "hello" });

    const hiddenSpan = { kind: "hidden" as const, tag: "lie", attrs: {}, raw: "<lie>the truth</lie>" };
    const hiddenPart = await __spanToWirePartForTest(hiddenSpan, wireEnv, wireRow);
    expect(hiddenPart).toEqual({ type: "text", text: hiddenSpan.raw });

    const directiveSpan = { kind: "unknown-directive" as const, raw: "<gmnote>note</gmnote>" };
    const directivePart = await __spanToWirePartForTest(directiveSpan, wireEnv, wireRow);
    expect(directivePart).toEqual({ type: "text", text: directiveSpan.raw });
  });

  test('wire:"drop" (choices) strips the span entirely from the wire', async () => {
    expect(CONTENT_CLASS_POLICY.choices.wire).toBe("drop");
    const part = await __spanToWirePartForTest(
      { kind: "choices", options: ["Go north", "Go south"], raw: ":::choices\nGo north\nGo south\n:::" },
      wireEnv,
      wireRow,
    );
    expect(part).toBeNull();
  });

  test("the empty-conversion table SHAPE reads agrees with the dispatch, span kind by span kind", async () => {
    const spans: ContentSpan[] = [
      { kind: "text", text: "hello" },
      { kind: "text", text: "" },
      { kind: "choices", options: ["Go north"], raw: ":::choices\nGo north\n:::" },
      { kind: "hidden", tag: "lie", attrs: {}, raw: "<lie>x</lie>" },
      { kind: "unknown-directive", raw: "<gmnote>n</gmnote>" },
      { kind: "card", title: "T", body: "…", origin: "fence", raw: ':::card title="T"\n…\n:::' },
      { kind: "image", alt: "a cat", ref: { kind: "external", url: "https://example.test/cat.png" } },
    ];
    for (const span of spans) {
      const part = await __spanToWirePartForTest(span, wireEnv, wireRow);
      expect({ kind: span.kind, empty: __spanConvertsToNothingForTest(span) }).toEqual({ kind: span.kind, empty: part === null });
    }
  });

  test('wire:"stub" (card) collapses OUTSIDE the keep-last-X window', async () => {
    expect(CONTENT_CLASS_POLICY.card.wire).toBe("stub");
    const cardSpan = { kind: "card" as const, title: "The Ledger", body: "…", origin: "fence" as const, raw: ':::card title="The Ledger"\n…\n:::' };
    const part = await __spanToWirePartForTest(cardSpan, wireEnv, wireRow);
    expect(part).toEqual({ type: "text", text: "[card: The Ledger]" });
    // Inside the keep-last-X window the card rides full, byte-identical to its raw bytes — the wire=stub
    // plane's declared exception, not a disagreement with the table.
    const fullPart = await __spanToWirePartForTest(cardSpan, { ...wireEnv, fullCards: new Set([cardSpan]) }, wireRow);
    expect(fullPart).toEqual({ type: "text", text: cardSpan.raw });
  });
});

// NARRATOR ASSEMBLY — what an `output:"narrator"` round actually SENDS. A narrator round is ONE call voicing
// every seated character, authored by the synthetic group character, which by construction is NOT in `speakerRefs`.
// These pin the two facts a live drive (2026-08-07, 2026-08-07)
// found MISSING from the wire: the co-speakers' CARDS never reached the model (the system row named the
// primary 7x and the co-speaker 0x), and `{{char}}` bound to the primary alone, so the shipped main-prompt
// framing opened "write <primary>'s perspective only" on a turn voicing everybody. Asserted on
// `request.prompt.static` — the bytes the model receives — never on the shaping API, so the pin is a defect
// proof and not a signature check.

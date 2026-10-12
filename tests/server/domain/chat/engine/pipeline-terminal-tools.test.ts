// engine/pipeline — R1: TERMINAL tools (the folded state extraction).

import { makeCapability, makeGenerationCapability } from "@orb/testkit/node/factories/resolved-connection.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import type { TurnRequest } from "./_pipeline-support.ts";
import {
  baseArgs,
  CAPABILITY,
  CONNECTION,
  doneFinal,
  fakeToolOps,
  offeredNames,
  runTurnPipeline,
  scriptedDepths,
  scriptedTurn,
  TOOL_CONNECTION,
  toolFinal,
} from "./_pipeline-support.ts";

// ── R1: TERMINAL tools (the folded state extraction) ──────────────────────────────────────────────
// The whole point of the seam: these tools reach the wire, the model may call them, and NOTHING executes,
// recurses, or is recorded. The calls come back on `terminalToolCalls` and go to the rpg flush instead of a
// second model call. The `null` vs `[]` distinction is TOTAL and load-bearing — `null` tells the consumer
// "the fold did not happen, run your own round", `[]` tells it "the fold happened and the beat was quiet".

const RPG_TERMINAL_TOOLS = [
  { name: "update_scene", description: "the scene", parameters: { type: "object" as const } },
  { name: "no_changes", description: "nothing changed", parameters: { type: "object" as const } },
];

describe("runTurnPipeline — terminal tools (R1 fold)", () => {
  test("attaches the tools with tool_choice auto, executes NOTHING, and returns the co-emitted calls", async () => {
    const requests: TurnRequest[] = [];
    const executed: string[][] = [];
    const { args } = baseArgs({
      connection: TOOL_CONNECTION,
      // Tool-use IS wired and would happily execute — proving the terminal path bypasses it BY SHAPE, not by
      // the ops being absent.
      tools: fakeToolOps(executed),
      attachedToolNames: [],
      terminalTools: RPG_TERMINAL_TOOLS,
      runChatTurn: scriptedDepths(
        [[toolFinal("She draws her blade and steps into the rain.", [{ id: "c1", name: "update_scene", args: '{"weather":"rain"}' }])]],
        requests,
      ),
    });
    const result = await runTurnPipeline(args);

    // ONE model call — the recurse loop never pivoted, so no second call was paid (the entire R1 win).
    expect(requests).toHaveLength(1);
    expect(requests[0]?.tools?.terminal?.map((t) => t.name)).toEqual(["update_scene", "no_changes"]);
    // Nothing executable rode: the terminal set is the whole offer. (The wire's `auto`, NEVER `required` — which
    // measurably kills the prose, 0/6 narratives in the spike — is the projection's; see chat-request.test.ts.)
    expect(requests[0]?.tools?.offer).toBeUndefined();
    // The narrative survived intact alongside the state call.
    expect(result.content).toBe("She draws her blade and steps into the rain.");
    // Nothing executed, nothing recorded — the tool traffic stays server-internal, exactly as the separate
    // round's did (it must never reach a member-visible payload via the variant's toolCalls).
    expect(executed).toEqual([]);
    expect(result.toolRecords).toEqual([]);
    expect(result.terminalToolCalls?.map((c) => c.name)).toEqual(["update_scene"]);
    expect(result.terminalToolCalls?.[0]?.arguments).toBe('{"weather":"rain"}');
  });

  test("NO terminal economics (a stream with no final chunk) reports a NULL channel, never a false quiet beat", async () => {
    // The dangerous collapse: `economics === null` means the wire never delivered a completion, so we know
    // NOTHING about what the model called. Reporting `[]` there would tell the consumer "it chose to record
    // nothing", suppress its fallback, and drop the turn's state behind a cheerful log.
    const { args } = baseArgs({
      connection: TOOL_CONNECTION,
      terminalTools: RPG_TERMINAL_TOOLS,
      // Text deltas only — no `final` chunk, so `reduceStream` returns economics: null.
      runChatTurn: scriptedTurn([{ kind: "text", text: "She fords the river." }]),
    });
    const result = await runTurnPipeline(args);
    expect(result.economics).toBeNull();
    expect(result.terminalToolCalls).toBeNull();
    // The prose still reduced off the deltas — the narrative is unaffected by the missing state channel.
    expect(result.content).toBe("She fords the river.");
  });

  test("a turn that calls no terminal tool yields an EMPTY array (a quiet beat), never null", async () => {
    const { args } = baseArgs({
      connection: TOOL_CONNECTION,
      terminalTools: RPG_TERMINAL_TOOLS,
      runChatTurn: scriptedDepths([[doneFinal("Nothing much happens.")]], []),
    });
    const result = await runTurnPipeline(args);
    expect(result.terminalToolCalls).toEqual([]);
    expect(result.content).toBe("Nothing much happens.");
  });

  test("no terminal tools requested ⇒ a byte-identical tool-less request and a NULL channel", async () => {
    const requests: TurnRequest[] = [];
    const { args } = baseArgs({ connection: TOOL_CONNECTION, runChatTurn: scriptedDepths([[doneFinal("hi")]], requests) });
    const result = await runTurnPipeline(args);
    expect(requests[0]?.tools).toBeUndefined();
    expect(result.terminalToolCalls).toBeNull();
  });

  test("a model with no tools capability drops them and reports a NULL channel (the consumer falls back)", async () => {
    const requests: TurnRequest[] = [];
    const { args } = baseArgs({
      // CONNECTION's capability has no `tools` key at all.
      terminalTools: RPG_TERMINAL_TOOLS,
      runChatTurn: scriptedDepths([[doneFinal("hi")]], requests),
    });
    const result = await runTurnPipeline(args);
    expect(requests[0]?.tools).toBeUndefined();
    expect(result.terminalToolCalls).toBeNull();
  });

  test("an agent-sdk connection gets the SAME neutral terminal declarations — one call, a LIVE channel", async () => {
    // Eligibility is a CAPABILITY question (this connection co-emits), never a wire one — the fold must NOT be
    // pushed onto its fallback round here. The DELIVERY (a deny-on-use MCP server on this wire) is inference's
    // projection of the same `tools.terminal`, so the request the pipeline builds is the array wire's, verbatim.
    const requests: TurnRequest[] = [];
    const { args } = baseArgs({
      connection: { ...TOOL_CONNECTION, api: "agent-sdk" },
      terminalTools: RPG_TERMINAL_TOOLS,
      runChatTurn: scriptedDepths(
        [[toolFinal("She draws her blade and steps into the rain.", [{ id: "c1", name: "update_scene", args: '{"weather":"rain"}' }])]],
        requests,
      ),
    });
    const result = await runTurnPipeline(args);
    expect(requests).toHaveLength(1); // one model call — the fallback round is deleted on this wire too
    expect(requests[0]?.tools?.terminal?.map((t) => t.name)).toEqual(["update_scene", "no_changes"]);
    // Nothing was resolved into an executable offer.
    expect(requests[0]?.tools?.offer).toBeUndefined();
    expect(result.terminalToolCalls?.map((c) => c.name)).toEqual(["update_scene"]);
    expect(result.toolRecords).toEqual([]);
  });

  test("a wire that SILENCES prose under tool attachment gets none — the narrative call is tool-less (D112 fold guard)", async () => {
    const requests: TurnRequest[] = [];
    // The REAL local-engine descriptor, not a synthetic literal: the vLLM arm declares `tools.silencesProse`
    // (measured — `content:null` on 36/36 tool-attached turns), so terminal tools must never reach this wire.
    // It IS tools-capable, which is exactly why the `capability.tools !== undefined` gate alone is not enough.
    const local = makeGenerationCapability({ ...CAPABILITY, tools: { parallel: true, silencesProse: true } });
    expect(local.tools).toBeDefined();
    const { args } = baseArgs({
      connection: { ...CONNECTION, capability: makeCapability(local) },
      terminalTools: RPG_TERMINAL_TOOLS,
      runChatTurn: scriptedDepths([[doneFinal("She fords the river, and the water takes her boots.")]], requests),
    });
    const result = await runTurnPipeline(args);
    // The silencing cause is ABSENT from the request — the prose is never traded for the passenger.
    expect(requests[0]?.tools).toBeUndefined();
    expect(result.content).toBe("She fords the river, and the water takes her boots.");
    // …and the contributor is TOLD (null channel ⇒ it runs its own post-commit round), never silently dropped.
    expect(result.terminalToolCalls).toBeNull();
  });

  test("terminal tools ride ALONGSIDE registry tools without stealing their loop", async () => {
    const requests: TurnRequest[] = [];
    const executed: string[][] = [];
    const { args } = baseArgs({
      connection: TOOL_CONNECTION,
      tools: fakeToolOps(executed),
      attachedToolNames: ["tick_clock"],
      terminalTools: RPG_TERMINAL_TOOLS,
      runChatTurn: scriptedDepths([[toolFinal("tick... ", [{ id: "c1", name: "tick_clock", args: "{}" }])], [doneFinal("done.")]], requests),
    });
    const result = await runTurnPipeline(args);
    // Both sets reached the wire; the REGISTRY tool still executed + recursed exactly as before.
    expect(offeredNames(requests[0])).toEqual(["tick_clock", "update_scene", "no_changes"]);
    expect(executed).toEqual([["tick_clock"]]);
    expect(result.toolRecords.map((r) => r.name)).toEqual(["tick_clock"]);
    // The terminal channel reports the terminal-partitioned calls across every depth — none were emitted here.
    expect(result.terminalToolCalls).toEqual([]);
  });

  // ── #1404: the MIXED case. Both classes ride the one `tools` array on the array wires, so "which executor
  // owns this call" was answered by "did a registry set resolve", never by the call's own identity. The
  // partition below is by TOOL NAME (the one mint), computed where the declarations are attached and handed to
  // BOTH readers — so the registry executor structurally cannot receive a terminal call and the terminal
  // channel structurally cannot report a registry one.

  test("MIXED attach: a TERMINAL call is never handed to the registry executor (#1404)", async () => {
    const requests: TurnRequest[] = [];
    const executed: string[][] = [];
    const { args } = baseArgs({
      connection: TOOL_CONNECTION,
      tools: fakeToolOps(executed),
      attachedToolNames: ["tick_clock"],
      terminalTools: RPG_TERMINAL_TOOLS,
      // Both classes are attached and the model picks the TERMINAL one.
      runChatTurn: scriptedDepths([[toolFinal("She draws her blade.", [{ id: "c1", name: "update_scene", args: '{"weather":"rain"}' }])]], requests),
    });
    const result = await runTurnPipeline(args);
    // Nothing executed, nothing recorded, and NO second model call was paid — the terminal contract holds
    // whether or not registry tools happen to ride the same turn.
    expect(executed).toEqual([]);
    expect(result.toolRecords).toEqual([]);
    expect(requests).toHaveLength(1);
    // …and the call comes back on the channel that owns it, with the narrative intact.
    expect(result.terminalToolCalls?.map((c) => c.name)).toEqual(["update_scene"]);
    expect(result.terminalToolCalls?.[0]?.arguments).toBe('{"weather":"rain"}');
    expect(result.content).toBe("She draws her blade.");
  });

  test("MIXED attach: ONE completion carrying BOTH classes splits — the registry half executes, the terminal half reports (#1404)", async () => {
    const requests: TurnRequest[] = [];
    const executed: string[][] = [];
    const { args } = baseArgs({
      connection: TOOL_CONNECTION,
      tools: fakeToolOps(executed),
      attachedToolNames: ["tick_clock"],
      terminalTools: RPG_TERMINAL_TOOLS,
      runChatTurn: scriptedDepths(
        [
          [
            toolFinal("tick... ", [
              { id: "c1", name: "tick_clock", args: "{}" },
              { id: "c2", name: "update_scene", args: '{"weather":"rain"}' },
            ]),
          ],
          [doneFinal("done.")],
        ],
        requests,
      ),
    });
    const result = await runTurnPipeline(args);
    // Only the registry half recursed — the terminal passenger never became a second paid call.
    expect(executed).toEqual([["tick_clock"]]);
    expect(result.toolRecords.map((r) => r.name)).toEqual(["tick_clock"]);
    // …and the terminal half survives the recursion: the calls are collected AT THE DEPTH THEY WERE EMITTED,
    // never re-read off the final aggregate economics (whose `toolCalls` are the LAST depth's alone).
    expect(result.terminalToolCalls?.map((c) => c.name)).toEqual(["update_scene"]);
  });

  // #1617 AMENDS THIS PIN, and the #1404 ruling it encodes SURVIVES: the registry still keeps the name (it is
  // the class that EXECUTES; a mis-executed passenger runs an unowned side effect). What changed is the OTHER
  // half of the drop. Riding the SURVIVING declarations looked graceful and was the one arm with no honest
  // report — `attached:true` flowed back, the fold took its folded path with one plane missing, and nothing
  // outside the server log said so. Now ANY collision withholds the whole channel for the turn and NAMES what
  // it refused, so the consumer's fallback round captures every plane.
  test("a terminal declaration COLLIDING with a registry tool name withholds the WHOLE channel, named (#1404, #1617)", async () => {
    const requests: TurnRequest[] = [];
    const executed: string[][] = [];
    const { args } = baseArgs({
      connection: TOOL_CONNECTION,
      tools: fakeToolOps(executed),
      attachedToolNames: ["tick_clock"],
      // A contributor that re-spells a registry name would otherwise ship the wire TWO declarations of one
      // name (malformed) and make the partition unanswerable. The passenger yields — all of it.
      terminalTools: [{ name: "tick_clock", description: "the terminal twin", parameters: { type: "object" as const } }, ...RPG_TERMINAL_TOOLS],
      runChatTurn: scriptedDepths([[toolFinal("tick... ", [{ id: "c1", name: "tick_clock", args: "{}" }])], [doneFinal("done.")]], requests),
    });
    const result = await runTurnPipeline(args);
    // NOT the surviving subset: the wire carries the registry declarations alone.
    expect(offeredNames(requests[0])).toEqual(["tick_clock"]);
    // The name stays the REGISTRY's: it executes and recurses, and the terminal channel never claims it.
    expect(executed).toEqual([["tick_clock"]]);
    expect(result.toolRecords.map((r) => r.name)).toEqual(["tick_clock"]);
    // `null`, not `[]`: `[]` would tell the consumer "they rode and the model recorded nothing" — a quiet
    // beat that never happened — and suppress the fallback that still has to write this turn's state.
    expect(result.terminalToolCalls).toBeNull();
    // …and the reason that `null` is not the wire's fault.
    expect(result.terminalToolsCollided).toEqual(["tick_clock"]);
  });

  test("#1617 a TOTAL collision reports the same named outcome (it used to read as an ineligible wire)", async () => {
    const requests: TurnRequest[] = [];
    const executed: string[][] = [];
    const { args } = baseArgs({
      connection: TOOL_CONNECTION,
      tools: fakeToolOps(executed),
      attachedToolNames: ["update_scene"],
      // Every declaration collides, which used to leave `wanted` empty — indistinguishable from "none
      // requested", so the consumer was told the wire could not carry terminal tools. It could.
      terminalTools: [{ name: "update_scene", description: "the terminal twin", parameters: { type: "object" as const } }],
      runChatTurn: scriptedDepths([[doneFinal("done.")]], requests),
    });
    const result = await runTurnPipeline(args);
    expect(result.terminalToolCalls).toBeNull();
    expect(result.terminalToolsCollided).toEqual(["update_scene"]);
  });

  test("#1617 an ORDINARY turn reports NO collisions (the planted control for the field)", async () => {
    const requests: TurnRequest[] = [];
    const { args } = baseArgs({
      connection: TOOL_CONNECTION,
      terminalTools: RPG_TERMINAL_TOOLS,
      runChatTurn: scriptedDepths([[toolFinal("", [{ id: "c1", name: "update_scene", args: '{"weather":"rain"}' }])]], requests),
    });
    const result = await runTurnPipeline(args);
    expect(result.terminalToolsCollided).toEqual([]);
    expect(result.terminalToolCalls?.map((c) => c.name)).toEqual(["update_scene"]);
  });

  // #1604 — after #1404 the terminal half is collected AT THE DEPTH IT WAS EMITTED and accumulated across the
  // whole recurse loop. A folded game that ALSO attaches registry tools can therefore hand the fold several
  // depths' calls; nothing pinned that, and the fold's contract did not state it. Both depths' calls survive,
  // in EMISSION ORDER — which is what makes the fold's last-wins `scene` plane read correctly (a later depth
  // saw the earlier depth's tool results).
  test("#1604 terminal calls from SEVERAL recursion depths all reach the channel, in emission order", async () => {
    const requests: TurnRequest[] = [];
    const executed: string[][] = [];
    const { args } = baseArgs({
      connection: TOOL_CONNECTION,
      tools: fakeToolOps(executed),
      attachedToolNames: ["tick_clock"],
      terminalTools: RPG_TERMINAL_TOOLS,
      runChatTurn: scriptedDepths(
        [
          // Depth 0: a terminal call co-emitted with the registry call that triggers the recursion. The
          // aggregate economics keep only the LAST depth's `toolCalls`, so a re-read here would erase it.
          [
            toolFinal("tick... ", [
              { id: "c1", name: "tick_clock", args: "{}" },
              { id: "c2", name: "update_scene", args: '{"weather":"rain"}' },
            ]),
          ],
          // Depth 1: a second terminal call, emitted after the registry tool's result came back.
          [toolFinal("done.", [{ id: "c3", name: "update_scene", args: '{"weather":"clearing"}' }])],
        ],
        requests,
      ),
    });
    const result = await runTurnPipeline(args);
    // Only the registry half ever recursed — two depths, one execution.
    expect(executed).toEqual([["tick_clock"]]);
    expect(result.terminalToolCalls?.map((c) => c.toolCallId)).toEqual(["c2", "c3"]);
    // Emission order, so the fold's single-valued `scene` plane lands on the LATER depth's view of the world.
    expect(result.terminalToolCalls?.map((c) => c.arguments)).toEqual(['{"weather":"rain"}', '{"weather":"clearing"}']);
  });
});

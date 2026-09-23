// CONFORMANCE — UNSUPPORTED SETTINGS (D41, no silent degrade). A knob the wire cannot spell must be DROPPED
// LOUDLY: a `warning` event carrying a code from `WARNING_CODES`, and the knob absent from the bytes that
// actually left. Both halves or neither — a warning with the knob still on the wire is a lie about what the
// model received, and a clean drop with no warning is the silent degrade D41 exists to forbid.
//
// THE DEGRADE IS CAPABILITY-DRIVEN, so one arm drives all three chat wires with no per-wire roster: a
// capability whose `sampling` axis is EMPTY plus an intent asking for `temperature`. `funnel/resolve-chat.ts`
// is the single funnel all three runners call (`resolveChat` directly on the hosted pair,
// `backends/agent-sdk/translate.ts::toSdkGeneration` on the subscription), so the same capability produces
// the same `sampling_knob_dropped` verdict on each — and a wire that forgot to surface the funnel's warnings
// reds here while its request bytes stay byte-identical to yesterday's.
//
// THE "NEVER SENT" HALF READS `captureWire`, which is the ONE send-boundary observation that exists on every
// wire — including agent-sdk, whose `body` is the SDK query input precisely because that wire has no
// observable HTTP body. A per-wire request recorder could not make this assertion cross-backend at all.
//
// WHAT THESE PINS WOULD CATCH
//  · Delete the `appendWarnings(result, gen.warnings, …)` call at the end of `backends/agent-sdk/runner.ts`'s
//    `runChatTurn` and only the subscription wire reds — the funnel still drops the knob correctly, but the
//    product never hears about it. Nothing else in the tree asserts that hand-off.
//  · Make `backends/v4/options.ts::standardSampling` pass an unresolved knob straight through and the
//    "never sent" half reds on the hosted wires while the warning half still passes — which is the exact
//    shape of "we told the user we dropped it and sent it anyway".

import type { CapabilityOverrideInput, Wire } from "@orb/contracts/inference";
import { WARNING_CODES } from "../../../packages/inference/src/contract/resolve.ts";
import { expect, test } from "../../support/fixtures.ts";
import type { ChatScript } from "./_harness.ts";
import { CONFORMANCE_WIRES, cellTest, chatCapability, driveChat, warningCodesOf } from "./_harness.ts";

/** The knob, and the literal a wire would spell it with. Asserted against the WHOLE captured body rather
 *  than a known key path: each wire nests its sampling differently, and a deep string test cannot be fooled
 *  by a knob that moved into `providerOptions`, `extraBody` or an env override. */
const KNOB = "temperature";

function scriptFor(wire: Wire): ChatScript {
  return { deltas: ["ok"], stop: wire === "anthropic-messages" ? "end_turn" : "stop", tokensIn: 3, tokensOut: 2 };
}

for (const wire of CONFORMANCE_WIRES) {
  cellTest(wire, "chat", "a knob the capability does not expose is dropped with a warning AND never sent (D41)", async () => {
    const { events, captured, turn } = await driveChat(wire, {
      script: scriptFor(wire),
      // An empty `sampling` axis is "this model exposes no sampler ranges at all" — the funnel's
      // `resolveNumeric` has nothing to clamp against and must drop, loudly.
      capability: chatCapability({ sampling: {} }),
      params: { temperature: 0.9 },
    });

    const codes = warningCodesOf(events);
    expect(codes, "the drop was announced").toContain("sampling_knob_dropped");
    for (const code of codes) {
      expect(WARNING_CODES, "every emitted warning code is inside the closed vocabulary").toContain(code);
    }
    const dropped = events.find((event) => event.kind === "warning" && event.code === "sampling_knob_dropped");
    expect(dropped, "the warning names WHICH knob was dropped — a bare code is not a receipt").toMatchObject({ knob: KNOB });
    // The turn's own record must carry the warning too, not only the live callback: the callback is the room,
    // the events array is what a caller with no bus reads.
    expect(warningCodesOf(turn.events), "the record carries the warning as well as the stream").toContain("sampling_knob_dropped");

    // …and it never left. `captured` is every send-boundary body this turn produced.
    expect(captured.length, "the turn reached the send boundary at least once").toBeGreaterThan(0);
    for (const body of captured) {
      expect(JSON.stringify(body), `the dropped "${KNOB}" was still on the wire`).not.toContain(`"${KNOB}"`);
    }
  });

  cellTest(wire, "chat", "a knob the capability DOES expose is either SENT or announced as dropped — never neither", async () => {
    // THE D41 DISJUNCTION, and the positive control for the arm above in one: without it, a wire that
    // dropped EVERY knob unconditionally would pass the degrade pin while being broken in the opposite
    // direction. Stated as `sent || announced` rather than "sent", because which of the two a wire owes
    // depends on whether that wire can spell the knob at all — and THAT is a per-wire fact the suite must
    // not hand-roster. What no wire may do is neither: resolve the knob, report it applied, and send nothing.
    const { events, captured } = await driveChat(wire, {
      script: scriptFor(wire),
      capability: chatCapability({ sampling: { temperature: { min: 0, max: 2 } } }),
      params: { temperature: 0.9 },
    });
    const sent = captured.some((body) => JSON.stringify(body).includes(`"${KNOB}"`));
    // Either dropper may announce it: the funnel (`sampling_knob_dropped`) or the provider SDK after it
    // (`sdk_unsupported_setting`, e.g. Anthropic refusing `temperature` while thinking is on, which the
    // default adaptive effort turns on here). Both name the knob, and both keep it out of the applied record.
    const announced = events.some(
      (event) => event.kind === "warning" && (event.code === "sampling_knob_dropped" || event.code === "sdk_unsupported_setting") && event.knob === KNOB,
    );
    expect(sent || announced, `"${KNOB}" was resolved, reported applied, and then neither sent nor announced as dropped`).toBe(true);
  });
}

// THE GUARD THAT MAKES THE DISJUNCTION HOLD ON THE SUBSCRIPTION WIRE, pinned rather than assumed.
// `backends/agent-sdk/translate.ts::buildGenerationOptions` spells ONLY `thinking`/`effort` into the SDK
// options — every resolved sampler knob is discarded there with no warning and no code, which is the silent
// degrade D41 forbids. It is unreachable today for exactly ONE reason: the curated row below states that the
// Claude runtime exposes no sampler at all, so the funnel drops each preset knob loudly before translation
// ever runs. That safety property currently lives in a DATA ROW that nothing checks; this is the check.
// Widen that axis from any capability source — curated, measured, or a connection's own `declared` block,
// which outranks curated in the fold — and the silent path opens. Then this reds, and it reds pointing at
// the translation gap rather than at a mysteriously missing warning.
test("the agent-sdk curated capability exposes NO sampler range — the row D41 depends on, on that wire", async () => {
  const { anthropicRows } = await import("../../../packages/inference/src/capability/sources/curated/anthropic.ts");
  // Widened to the declared row type: the module ships a `const` TUPLE, whose members do not share a `wire`
  // or a `sampling` key, so the literal type cannot be filtered on either.
  const rows: readonly CapabilityOverrideInput[] = anthropicRows;
  const agentSdkRows = rows.filter((row) => row.match?.wire === "agent-sdk");
  expect(agentSdkRows.length, "the agent-sdk curated row exists").toBeGreaterThan(0);
  for (const row of agentSdkRows) {
    expect(Object.keys(row.generation?.sampling ?? {}), `curated row ${row.match?.model ?? "?"} widened the agent-sdk sampler axis`).toEqual([]);
  }
});

// THE PLANTED CONTROL for `backends/agent-sdk/translate.ts::droppedSamplerWarnings`. The curated path can
// NEVER exercise that code — it exists precisely for the axis curated keeps empty — so a test driven by the
// shipped capability would be a green that proves nothing. This drives the state a user can actually reach:
// a `declared.sampling` block, which the fold ranks ABOVE curated (§6.2), widening the axis on a
// `claude-sub` connection. The knob still cannot be sent; what changed is that the wire now SAYS so.
test("a user-widened sampler axis on the agent-sdk wire is ANNOUNCED, never silently discarded (D41)", async () => {
  const { events, captured } = await driveChat("agent-sdk", {
    script: scriptFor("agent-sdk"),
    capability: chatCapability({ sampling: { temperature: { min: 0, max: 2 }, topP: { min: 0, max: 1 } } }),
    params: { temperature: 0.9, topP: 0.5 },
  });
  const dropped = events.flatMap((event) => (event.kind === "warning" && event.code === "sampling_knob_dropped" ? [event.knob] : []));
  expect(dropped, "both widened knobs were announced by name").toEqual(expect.arrayContaining(["temperature", "topP"]));
  // The other half of the same law: announcing a drop is only honest if the knob really did not go out.
  for (const body of captured) {
    expect(JSON.stringify(body), "an announced-dropped knob was still on the wire").not.toContain(`"${KNOB}"`);
  }
});

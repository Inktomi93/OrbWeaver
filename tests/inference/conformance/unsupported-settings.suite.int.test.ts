// @subject packages/inference/src/funnel/resolve-chat.ts
// @subject packages/inference/src/backends/agent-sdk/translate.ts
import type { Wire } from "@orb/contracts/inference";
import { WARNING_CODE } from "@orb/contracts/inference";
import type { JsonObject } from "@orb/kit/json";
import { jsonObjectSchema } from "@orb/kit/json";
import { expect, test } from "@orb/testkit/node";
import { PROVIDER_CAPABILITY_EVENT, PROVIDER_SAMPLING_EVENT } from "#inference/backends/http/provider-log.ts";
import { wireConnection } from "../roles/runtime.fixtures.ts";
import type { ChatScript } from "./runtime.fixtures.ts";
import { CONFORMANCE_CHAT_ROUTES, cellTest, chatCapability, conformanceRoot, driveChat, warningCodesOf } from "./runtime.fixtures.ts";

const KNOB = "temperature";

function scriptFor(wire: Wire): ChatScript {
  return { deltas: ["ok"], stop: wire === "anthropic-messages" ? "end_turn" : "stop", tokensIn: 3, tokensOut: 2 };
}

for (const route of CONFORMANCE_CHAT_ROUTES) {
  const { wire } = route;
  cellTest(route, "chat", "a knob the capability does not expose is dropped with a warning AND never sent (D41)", async () => {
    const { events, captured, turn } = await driveChat(route, {
      script: scriptFor(wire),
      // An empty `sampling` axis is "this model exposes no sampler ranges at all" — the funnel's
      // `resolveNumeric` has nothing to clamp against and must drop, loudly.
      capability: chatCapability({ sampling: {} }),
      params: { temperature: 0.9 },
    });

    const codes = warningCodesOf(events);
    expect(codes, "the drop was announced").toContain(WARNING_CODE.samplingKnobDropped);
    for (const code of codes) {
      expect(Object.values(WARNING_CODE), "every emitted warning code is inside the closed vocabulary").toContain(code);
    }
    const dropped = events.find((event) => event.kind === "warning" && event.code === WARNING_CODE.samplingKnobDropped);
    expect(dropped, "the warning names WHICH knob was dropped — a bare code is not a receipt").toMatchObject({ knob: KNOB });
    // The turn's own record must carry the warning too, not only the live callback: the callback is the room,
    // the events array is what a caller with no bus reads.
    expect(warningCodesOf(turn.events), "the record carries the warning as well as the stream").toContain(WARNING_CODE.samplingKnobDropped);

    // …and it never left. `captured` is every send-boundary body this turn produced.
    expect(captured.length, "the turn reached the send boundary at least once").toBeGreaterThan(0);
    for (const body of captured) {
      expect(JSON.stringify(body), `the dropped "${KNOB}" was still on the wire`).not.toContain(`"${KNOB}"`);
    }
  });

  cellTest(route, "chat", "a knob the capability DOES expose is either SENT or announced as dropped — never neither", async () => {
    // THE D41 DISJUNCTION, and the positive control for the arm above in one: without it, a wire that
    // dropped EVERY knob unconditionally would pass the degrade pin while being broken in the opposite
    // direction. Stated as `sent || announced` rather than "sent", because which of the two a wire owes
    // depends on whether that wire can spell the knob at all — and THAT is a per-wire fact the suite must
    // not hand-roster. What no wire may do is neither: resolve the knob, report it applied, and send nothing.
    const { events, captured } = await driveChat(route, {
      script: scriptFor(wire),
      capability: chatCapability({ sampling: { temperature: { min: 0, max: 2 } } }),
      params: { temperature: 0.9 },
    });
    const sent = captured.some((body) => JSON.stringify(body).includes(`"${KNOB}"`));
    // Either dropper may announce it: the funnel (`sampling_knob_dropped`) or the provider SDK after it
    // (`sdk_unsupported_setting`, e.g. Anthropic refusing `temperature` while thinking is on, which the
    // default adaptive effort turns on here). Both name the knob, and both keep it out of the applied record.
    const announced = events.some(
      (event) =>
        event.kind === "warning" &&
        (event.code === WARNING_CODE.samplingKnobDropped || event.code === WARNING_CODE.sdkUnsupportedSetting) &&
        event.knob === KNOB,
    );
    expect([sent, announced], `"${KNOB}" was resolved, reported applied, and then neither sent nor announced as dropped`).toContain(true);
  });

  cellTest(route, "chat", "an authored chain of thought that no continue row can carry is announced as dropped and never sent", async () => {
    // The seed's D41: it rides ONLY a stamped continue row, and this fixture's history is one user turn — so
    // every wire owes the same loud drop here. The honoring route (a stamped row) is pinned by
    // tests/server/domain/chat/verbs/turn-teaching.suite.int.test.ts, which reads the seed on the wire bytes.
    const { events, captured, turn } = await driveChat(route, {
      script: scriptFor(wire),
      prefillReasoning: "SEED the user wants one line; keep it short.",
    });
    expect(warningCodesOf(events), "the drop was announced").toContain(WARNING_CODE.prefillReasoningDropped);
    expect(warningCodesOf(turn.events), "the record carries the warning as well as the stream").toContain(WARNING_CODE.prefillReasoningDropped);
    for (const body of captured) {
      expect(JSON.stringify(body), "the dropped seed was still on the wire").not.toContain("SEED the user wants one line");
    }
  });
}

test("an undeclared saved subscription resolves with no sampler range on the production path (D41)", async () => {
  await using root = await conformanceRoot();
  const connection = await wireConnection(root, { task: "chat", providerId: "claude-sub", model: "claude-opus-5" });
  expect(connection.capability.kind).toBe("generation");
  if (connection.capability.kind !== "generation") {
    throw new Error("the production chat resolve returned a non-generation model");
  }
  expect(Object.keys(connection.capability.generation.sampling)).toEqual([]);
});

test("a user-widened sampler axis on the agent-sdk wire is ANNOUNCED, never silently discarded (D41)", async () => {
  const { events, captured } = await driveChat("agent-sdk", {
    script: scriptFor("agent-sdk"),
    capability: chatCapability({ sampling: { temperature: { min: 0, max: 2 }, topP: { min: 0, max: 1 } } }),
    params: { temperature: 0.9, topP: 0.5 },
  });
  const dropped = events.flatMap((event) => (event.kind === "warning" && event.code === WARNING_CODE.samplingKnobDropped ? [event.knob] : []));
  expect(dropped, "both widened knobs were announced by name").toEqual(expect.arrayContaining(["temperature", "topP"]));
  // The other half of the same law: announcing a drop is only honest if the knob really did not go out.
  for (const body of captured) {
    expect(JSON.stringify(body), "an announced-dropped knob was still on the wire").not.toContain(`"${KNOB}"`);
  }
});

const SCENE_TOOL = {
  name: "record_scene",
  description: "Record the scene state.",
  parameters: { type: "object", properties: { mood: { type: "string" } }, required: ["mood"] },
} as const;

test("a preset's parallelToolCalls is ANNOUNCED as dropped on an agent-sdk turn that carries tools", async () => {
  const { events } = await driveChat("agent-sdk", {
    script: scriptFor("agent-sdk"),
    params: { advanced: { parallelToolCalls: true } },
    terminalTools: [SCENE_TOOL],
  });
  const dropped = events.flatMap((event) => (event.kind === "warning" && event.code === WARNING_CODE.samplingKnobDropped ? [event.knob] : []));
  expect(dropped).toContain("parallelToolCalls");
});

test("with no tools on the turn, parallelToolCalls is not announced on the agent-sdk wire", async () => {
  const { events } = await driveChat("agent-sdk", { script: scriptFor("agent-sdk"), params: { advanced: { parallelToolCalls: true } } });
  const dropped = events.flatMap((event) => (event.kind === "warning" && event.code === WARNING_CODE.samplingKnobDropped ? [event.knob] : []));
  expect(dropped).not.toContain("parallelToolCalls");
});

/** The last `provider.*` line of this event the root ring holds, fields parsed off the JSON line. */
function lastReceipt(lines: readonly string[], event: string): JsonObject {
  const matching = lines.filter((line) => line.includes(`"event":"${event}"`));
  const last = matching.at(-1);
  if (last === undefined) {
    throw new Error(`no ${event} line in the root ring (${lines.length} lines captured)`);
  }
  return jsonObjectSchema.parse(JSON.parse(last));
}

// Every turn runner emits the pair post-turn through `emitTurnReceipts`; the agent-sdk wire joined the canon
// when the exemption sentence in `result.ts` proved false (its generation resolves through the same funnel
// and its translator's second gate is exactly what the sampling line reports). Without this pin the wire
// silently regresses to capability-only — an operator reading claude-sub turns would see no knob story.
test("an agent-sdk turn emits the same receipt pair as the hosted wires, with its second-gate drops on the sampling line", async () => {
  const { receipts } = await driveChat("agent-sdk", {
    script: scriptFor("agent-sdk"),
    capability: chatCapability({ sampling: { temperature: { min: 0, max: 2 } } }),
    params: { temperature: 0.9 },
  });
  const sampling = lastReceipt(receipts, PROVIDER_SAMPLING_EVENT);
  expect(sampling["dropped"], "the runtime-ignored knob is listed by name on the receipt").toEqual(
    expect.arrayContaining([expect.objectContaining({ knob: KNOB })]),
  );
  expect(sampling, "a knob the runtime ignores is never claimed as applied").not.toHaveProperty(["applied", KNOB]);
  expect(sampling["requested"], "the receipt preserves the user's intent verbatim").toMatchObject({ [KNOB]: 0.9 });
  const capability = lastReceipt(receipts, PROVIDER_CAPABILITY_EVENT);
  expect(capability["api"], "the capability line names the wire's api").toBe("agent-sdk");
});

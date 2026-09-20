// engine/engine (unit) — the infra→chat WARNING translation, the half `engine.int.test.ts` cannot cover
// exhaustively: a single turn cannot produce all twelve infra `WARNING_CODES` (they come from different
// runners, different wires and mutually exclusive reasoning modes), and until #1440 ten of them were mapped
// to `null` and filtered out, so a user believed a requested knob / reasoning budget / tool result had
// applied when the provider had ignored or clamped it.
//
// THE PIN THAT MATTERS IS TOTALITY: every member of the REAL infra tuple must reach the bus. Iterating
// `WARNING_CODES` (never a hand-written list) is what makes a NEW infra code fail here as well as at the
// translation's own `assertNever` — the tuple is the population, this file is the census.
//
// Pure: no db, no clock, no lock. `emitCapabilityDropWarnings` is the engine's own exported seam.

import type { DurableChatBusEvent } from "@orb/contracts/chat";
import { PROVIDER_ADJUSTMENT_KINDS } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { emitCapabilityDropWarnings } from "../../../../../packages/server/src/domain/chat/engine/engine.ts";
import type { ResolvedWarning, WarningCode } from "@orb/inference";
import { WARNING_CODES } from "@orb/inference";
import { expect, test } from "../../../../support/fixtures.ts";

const CHAT = castId<ChatId>("chat_warnmap");

/** The domain flags OFF — this file is about the runner-warning arm only. */
const NO_DOMAIN_DROPS = {
  imageDropped: false,
  videoDropped: false,
  toolsUnsupported: false,
  structuredOutputUnsupported: false,
  guidedPlacedAsInjection: false,
} as const;

/** Run the real emit seam over one runner warning and return the bus events it produced. */
async function busEventsFor(...runnerWarnings: readonly ResolvedWarning[]): Promise<DurableChatBusEvent[]> {
  const events: DurableChatBusEvent[] = [];
  await emitCapabilityDropWarnings(
    (event) => {
      events.push(event);
      return Promise.resolve();
    },
    CHAT,
    { ...NO_DOMAIN_DROPS, runnerWarnings },
  );
  return events;
}

/** The two codes chat spells identically in its OWN vocabulary — they pass through as themselves. */
const PASSTHROUGH: readonly WarningCode[] = ["custom_parameters_ignored", "image_edit_dropped"];

test("EVERY infra warning code reaches the bus — none is silently filtered (#1440)", async () => {
  for (const code of WARNING_CODES) {
    const events = await busEventsFor({ code, message: `${code} happened` });
    expect(events, `infra code ${code} produced no bus warning`).toHaveLength(1);
  }
});

test("the ten degradation classes ride the settings_adjusted carrier, each naming its own class", async () => {
  for (const kind of PROVIDER_ADJUSTMENT_KINDS) {
    const [event] = await busEventsFor({ code: kind, message: `${kind} happened` });
    expect(event).toMatchObject({ type: "warning", chatId: CHAT, code: "settings_adjusted", adjustment: kind });
  }
});

test("the two codes chat spells itself pass through under their OWN code, never the carrier", async () => {
  for (const code of PASSTHROUGH) {
    const [event] = await busEventsFor({ code, message: `${code} happened` });
    expect(event).toMatchObject({ type: "warning", chatId: CHAT, code });
  }
});

// The carrier is only worth having if the DETAIL survives it: `settings_adjusted` alone cannot tell a user
// which setting the provider refused, and the class alone cannot say what it used instead.

test("a dropped knob's NAME rides the carrier", async () => {
  const [event] = await busEventsFor({ code: "sampling_knob_dropped", knob: "topK", message: "topK ignored" });
  expect(event).toMatchObject({ code: "settings_adjusted", adjustment: "sampling_knob_dropped", knob: "topK" });
});

test("a clamp carries the VALUE the provider actually used — tokens", async () => {
  const [event] = await busEventsFor({ appliedBudget: 1536, code: "reasoning_budget_clamped", message: "clamped to 1536" });
  expect(event).toMatchObject({ adjustment: "reasoning_budget_clamped", appliedBudget: 1536, code: "settings_adjusted" });
});

test("a clamp carries the VALUE the provider actually used — effort", async () => {
  const [event] = await busEventsFor({ appliedEffort: "medium", code: "reasoning_mandatory_clamp", message: "clamped up to medium" });
  expect(event).toMatchObject({ adjustment: "reasoning_mandatory_clamp", appliedEffort: "medium", code: "settings_adjusted" });
});

test("the operator-only prose never crosses to the bus (D16 — no unanchored free text)", async () => {
  const [event] = await busEventsFor({ code: "verbosity_dropped", message: "verbosity ignored: model does not expose a verbosity level" });
  expect(JSON.stringify(event)).not.toContain("does not expose");
});

test("two drops sharing a code are two warnings — one per degrade, never one per code", async () => {
  const events = await busEventsFor(
    { code: "sampling_knob_dropped", knob: "topK", message: "topK ignored" },
    { code: "sampling_knob_dropped", knob: "minP", message: "minP ignored" },
  );
  expect(events).toHaveLength(2);
});

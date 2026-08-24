// S3 — THE CATALOGUE INVARIANTS. These are the mechanical enforcement of the spec §2 AUTHORING LAWS: every
// committed preset is BUILT here with its defaults and with knob overrides, and every predicate it produces is
// run through the REAL `@orb/kit/cel` seam against two activations —
//   (a) a POPULATED env (the counter keys set, the fact's message projection present), and
//   (b) an EMPTY-but-well-formed env (every root bound, every map empty, the fact carrying no `message`) —
// which is the first-ever-batch shape: R1 was refused (rate cap / lost authority) so its counter key does not
// exist, and a `chatOpened`-shaped fact carries no `message`. A predicate that violates law 1 (an unguarded
// `vars`/`event` read) THROWS there; a predicate that violates law 2 (bare mixed arithmetic) throws in BOTH.
// Eyeballing a preset's CEL is exactly how the dialect bit twice already — this suite is the substitute.
//
// The dialect facts themselves are pinned separately in `tests/kit/cel/cel-goldens.json`.

import type { AutomationAction, RulePresetId } from "@orb/contracts/automation";
import { automationActionsSchema, LIVE_TRIGGERS, RULE_PRESET_IDS } from "@orb/contracts/automation";
import type { CelBindings } from "@orb/kit/cel";
import { evalCel, isCelParseError, parseCel } from "@orb/kit/cel";
import { describe } from "vitest";
import type { ErasedRulePresetDef, RulePresetRuleDef } from "../../../../../packages/server/src/domain/automation/contract/presets.ts";
import { RULE_PRESETS } from "../../../../../packages/server/src/domain/automation/contract/presets.ts";
import { resolveRulePresetKnobs } from "../../../../../packages/server/src/domain/automation/substrate/presets.ts";
import { expect, test } from "../../../../support/fixtures.ts";

/** `createRule`'s per-rule default (`substrate/validate.ts` RULE_MAX_FIRES_DEFAULT) — law 4's floor: a rule
 *  that fires on EVERY beat must declare a cap ABOVE this or it freezes stale mid-session. */
const RULE_DEFAULT_FIRES_PER_HOUR = 30;
/** `substrate/validate.ts` RULE_MAX_FIRES_CAP — a preset asking above this is refused at mint. */
const RULE_MAX_FIRES_CAP = 240;

/** Every CEL root the live dispatch binds, with nothing populated — the first-ever-batch / unpopulated-
 *  projection shape a law-1 violation dies on. */
const EMPTY_ENV: CelBindings = {
  vars: {},
  choice: {},
  global: {},
  chat: { id: "chat_x", messageCount: 0 },
  now: { epochMs: 1_700_000_000_000, hour: 12, dayOfWeek: 3 },
  event: { type: "messageCommitted", bus: "chat", chatId: "chat_x" },
};

/** The same roots with the counter keys set and the fact's message projection present. */
const POPULATED_ENV: CelBindings = {
  vars: { clock: "9", debt: "3", debtBeat: "1" },
  choice: {},
  global: {},
  chat: { id: "chat_x", messageCount: 24 },
  now: { epochMs: 1_700_000_000_000, hour: 12, dayOfWeek: 3 },
  event: {
    type: "messageCommitted",
    bus: "chat",
    chatId: "chat_x",
    message: { id: "message_1", role: "user", authorUserId: "user_1", characterId: null, seq: 1, content: "I promise I will come back ((veil))" },
  },
};

function presetOf(id: RulePresetId): ErasedRulePresetDef {
  return RULE_PRESETS[id];
}

/** Build a preset with its declared defaults (through the real resolver — the mint's own path). */
function buildWithDefaults(id: RulePresetId): readonly RulePresetRuleDef[] {
  const preset = presetOf(id);
  return preset.rules(resolveRulePresetKnobs(preset.knobs, {}));
}

/** Evaluate a predicate through the real seam; returns the boolean, or a `{ error }` marker (so the failing
 *  assertion names the predicate rather than dying inside a try). */
function evaluate(predicate: string, env: CelBindings): boolean | { readonly error: string } {
  const program = parseCel(predicate);
  if (isCelParseError(program)) {
    return { error: `parse: ${program.message}` };
  }
  try {
    const result = evalCel(program, env);
    return typeof result === "boolean" ? result : { error: `non-boolean result: ${JSON.stringify(result)}` };
  } catch (err) {
    return { error: `eval: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** Whether a rule fires on EVERY event of its trigger — a null predicate, or a counter arm (`inc`/`dec`).
 *  These are law 4's subjects. */
function isCounterRule(rule: RulePresetRuleDef): boolean {
  return rule.predicate === null || rule.arms.some((arm: AutomationAction) => arm.type === "set_variable" && (arm.op === "inc" || arm.op === "dec"));
}

test("the registry is exhaustive over RULE_PRESET_IDS, in catalogue order", () => {
  expect(Object.keys(RULE_PRESETS)).toEqual([...RULE_PRESET_IDS]);
  expect(RULE_PRESET_IDS.map((id) => presetOf(id).id)).toEqual([...RULE_PRESET_IDS]);
});

test("the A3-committed catalogue is exactly the seven §4 rows that ride A3", () => {
  // #1/#3/#10 are A4's (confirm-first / suggestion riders), #8 rides A2's per-choice mode field, and
  // #2/#11/#14-#16/#20 ride later phases — none of them may creep in here.
  expect([...RULE_PRESET_IDS]).toEqual(["pacingNudge", "illustrateScenes", "diceChips", "clockFires", "sceneVeil", "callback", "cutaways"]);
});

describe.each([...RULE_PRESET_IDS])("preset %s", (id) => {
  test("declares a ruleCount its builder actually produces", () => {
    expect(buildWithDefaults(id)).toHaveLength(presetOf(id).ruleCount);
  });

  test("every minted arm parses through the live action schema (1..8 arms, real shapes)", () => {
    const parsed = buildWithDefaults(id).map((rule) => automationActionsSchema.safeParse(rule.arms).success);
    expect(parsed).toEqual(buildWithDefaults(id).map(() => true));
  });

  test("every trigger is a LIVE chat-bus trigger (a reserved one is refused at mint)", () => {
    expect(buildWithDefaults(id).map((rule) => LIVE_TRIGGERS[rule.triggerType])).toEqual(buildWithDefaults(id).map(() => true));
  });

  test("law 1 + law 2: every predicate evaluates to a BOOLEAN on an EMPTY env (no unguarded read, no bare arithmetic)", () => {
    const verdicts = buildWithDefaults(id)
      .filter((rule) => rule.predicate !== null)
      .map((rule) => ({ predicate: rule.predicate, verdict: evaluate(rule.predicate as string, EMPTY_ENV) }));
    expect(verdicts.filter((v) => typeof v.verdict !== "boolean")).toEqual([]);
  });

  test("law 1 + law 2: every predicate evaluates to a BOOLEAN on a POPULATED env", () => {
    const verdicts = buildWithDefaults(id)
      .filter((rule) => rule.predicate !== null)
      .map((rule) => ({ predicate: rule.predicate, verdict: evaluate(rule.predicate as string, POPULATED_ENV) }));
    expect(verdicts.filter((v) => typeof v.verdict !== "boolean")).toEqual([]);
  });

  test("law 4: a rule that fires on every beat carries an explicit HIGH maxFiresPerHour", () => {
    const offenders = buildWithDefaults(id)
      .filter(isCounterRule)
      .filter((rule) => rule.maxFiresPerHour === undefined || rule.maxFiresPerHour <= RULE_DEFAULT_FIRES_PER_HOUR);
    expect(offenders).toEqual([]);
  });

  test("every declared cap is within the mint's own ceiling (a drift becomes a typed refusal, not rot)", () => {
    const overCap = buildWithDefaults(id).filter((rule) => (rule.maxFiresPerHour ?? 0) > RULE_MAX_FIRES_CAP);
    expect(overCap).toEqual([]);
  });
});

// ── knob substitution: the knob reaches the CEL source / the arm template AS A LITERAL ─────────────────

test("a number knob substitutes into the cadence predicate as an int literal", () => {
  const preset = presetOf("pacingNudge");
  const [rule] = preset.rules(resolveRulePresetKnobs(preset.knobs, { everyN: 5 }));
  expect(rule?.predicate).toBe("int(chat.messageCount) % 5 == 0");
  // …and the default is a DIFFERENT literal (proving the substitution, not a coincidence).
  expect(buildWithDefaults("pacingNudge")[0]?.predicate).toBe("int(chat.messageCount) % 8 == 0");
});

test("a text knob substitutes into the veil predicate as an ESCAPED CEL string literal", () => {
  const preset = presetOf("sceneVeil");
  const [rule] = preset.rules(resolveRulePresetKnobs(preset.knobs, { veilWord: 'the "curtain"' }));
  // The embedded quotes are escaped — a raw interpolation would have built a broken/shifted predicate.
  expect(rule?.predicate).toBe('has(event.message) && event.message.content.contains("the \\"curtain\\"")');
  expect(evaluate(rule?.predicate as string, POPULATED_ENV)).toBe(false);
});

test("a textList knob substitutes into the callback predicate as a LOWERCASED disjunction", () => {
  const preset = presetOf("callback");
  const [r1] = preset.rules(resolveRulePresetKnobs(preset.knobs, { patterns: ["I Promise", "on my honour"], distance: 3 }));
  // `lowerAscii()` only lowers the HAYSTACK — the needles are lowered at build or the match silently never hits.
  expect(r1?.predicate).toBe(
    'has(event.message) && (event.message.content.lowerAscii().contains("i promise") || event.message.content.lowerAscii().contains("on my honour"))',
  );
  expect(evaluate(r1?.predicate as string, POPULATED_ENV)).toBe(true);
});

test("a number knob substitutes into the callback's distance predicate", () => {
  const preset = presetOf("callback");
  const rules = preset.rules(resolveRulePresetKnobs(preset.knobs, { distance: 3 }));
  expect(rules[1]?.predicate).toContain("int(chat.messageCount) - int(vars.debtBeat) >= 3");
  // POPULATED: debt=3, debtBeat=1, messageCount=24 ⇒ 23 >= 3.
  expect(evaluate(rules[1]?.predicate as string, POPULATED_ENV)).toBe(true);
});

test("a choice knob switches which ARM the clock preset mints", () => {
  const preset = presetOf("clockFires");
  const narrate = preset.rules(resolveRulePresetKnobs(preset.knobs, { firedArm: "narrate" }));
  const notify = preset.rules(resolveRulePresetKnobs(preset.knobs, { firedArm: "notify" }));
  expect(narrate[1]?.arms[0]?.type).toBe("trigger_turn");
  expect(notify[1]?.arms[0]?.type).toBe("post_notification");
  // A `post_notification` rule needs cooldownSeconds ≥ 60 or `createRule` refuses it (the inbox-spam floor).
  expect(notify[1]?.cooldownSeconds).toBe(60);
  expect(narrate[1]?.cooldownSeconds).toBeUndefined();
});

test("a choice knob substitutes into the generate_image arm's mode", () => {
  const preset = presetOf("illustrateScenes");
  const [rule] = preset.rules(resolveRulePresetKnobs(preset.knobs, { mode: "background" }));
  expect(rule?.arms[0]).toMatchObject({ type: "generate_image", mode: "background", quiet: false });
});

test("the two-rule presets order the COUNTER above the THRESHOLD (position order is the same-batch mechanism)", () => {
  // The dispatch runs a chat's rules in position order over ONE shared, write-through env — so the counter
  // must be minted first or the threshold reads the pre-increment value for a whole batch.
  const clock = buildWithDefaults("clockFires");
  expect(clock[0]?.arms[0]).toMatchObject({ type: "set_variable", key: "clock", op: "inc" });
  expect(clock[1]?.predicate).toContain("has(vars.clock)");

  const callback = buildWithDefaults("callback");
  expect(callback[0]?.arms.map((arm) => arm.type)).toEqual(["set_variable", "set_variable"]);
  expect(callback[1]?.arms.map((arm) => arm.type)).toEqual(["trigger_turn", "set_variable", "set_variable"]);
});

test("the callback anchors the beat through {{expr::…}} with law-2 coercion", () => {
  const [r1] = buildWithDefaults("callback");
  expect(r1?.arms[1]).toMatchObject({ type: "set_variable", key: "debtBeat", op: "set", value: "{{expr::int(chat.messageCount)}}" });
});

test("law 3: every default chip is a line the CLICKING member would say, and is its own send text", () => {
  const [rule] = buildWithDefaults("diceChips");
  const arm = rule?.arms[0];
  expect(arm?.type).toBe("surface_quick_reply");
  const choices = arm?.type === "surface_quick_reply" ? arm.choices : [];
  // The chip SENDS AS the clicking member, so label and send text are one and the same first-person line —
  // a director ask ("recap", "bring her in") would be words that member never chose to say.
  expect(choices.map((c) => c.sendTemplate)).toEqual(choices.map((c) => c.label));
  expect(choices.every((c) => c.label.startsWith("I "))).toBe(true);
});

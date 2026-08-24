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

import type { AutomationActionInput, RulePresetId } from "@orb/contracts/automation";
import { automationActionsSchema, LIVE_TRIGGERS, RULE_PRESET_IDS } from "@orb/contracts/automation";
import type { CelBindings } from "@orb/kit/cel";
import { evalCel, isCelParseError, parseCel } from "@orb/kit/cel";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
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

/** The populated `vars` bag, NAMED so a test can extend it: `CelBindings` is index-signature typed, so
 *  `{...POPULATED_ENV.vars}` is not a spreadable object type. */
const POPULATED_VARS: Record<string, string> = { clock: "9", debt: "3", debtBeat: "1" };

/** The same roots with the counter keys set and the fact's message projection present. */
const POPULATED_ENV: CelBindings = {
  vars: POPULATED_VARS,
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

/** The knobs a preset CANNOT usefully default, supplied here so the invariants below run against a rule the
 *  host could actually mint. Today exactly one row needs it: #3 auto-add lore references a LOREBOOK, and no
 *  knob kind can express an entity reference yet — so its `bookId` defaults to `""`, which is a deliberate
 *  mint-time refusal ("pick a book"), not an oversight. Keeping the map explicit means a preset that grows a
 *  required knob has to say so HERE, rather than quietly weakening a shared invariant. */
const REQUIRED_KNOBS: Partial<Record<RulePresetId, Readonly<Record<string, string>>>> = {
  autoAddLore: { bookId: mintTypeId(ID_PREFIX.worldBook) },
};

/** Build a preset with its declared defaults (through the real resolver — the mint's own path). */
function buildWithDefaults(id: RulePresetId): readonly RulePresetRuleDef[] {
  const preset = presetOf(id);
  return preset.rules(resolveRulePresetKnobs(preset.knobs, REQUIRED_KNOBS[id] ?? {}));
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
  return rule.predicate === null || rule.arms.some((arm: AutomationActionInput) => arm.type === "set_variable" && (arm.op === "inc" || arm.op === "dec"));
}

test("the registry is exhaustive over RULE_PRESET_IDS, in catalogue order", () => {
  expect(Object.keys(RULE_PRESETS)).toEqual([...RULE_PRESET_IDS]);
  expect(RULE_PRESET_IDS.map((id) => presetOf(id).id)).toEqual([...RULE_PRESET_IDS]);
});

test("the committed catalogue is exactly the A3 rows plus A4's four, in §4 order", () => {
  // A3 landed the seven that ride the preset substrate alone; A4 adds #1 (welcome-back recap — the
  // confirm-first card), #3 (auto-add lore, confirm-first by default), #8 (the compose-mode opener deck,
  // riding A2's per-choice mode field) and #10 (call a vote — send-mode chips, R7-invoked).
  // #2/#11/#14-#16/#20 ride later phases and may not creep in.
  expect([...RULE_PRESET_IDS]).toEqual([
    "welcomeBackRecap",
    "autoAddLore",
    "pacingNudge",
    "illustrateScenes",
    "diceChips",
    "clockFires",
    "openerChips",
    "sceneVeil",
    "callAVote",
    "callback",
    "cutaways",
  ]);
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

// ── A4's four rows (interaction-direction-spec §4 #1/#3/#8/#10) ────────────────────────────────────────

test("#1 welcome-back recap: the stamp rule is capped (law 4) and the recap arm is CONFIRM-FIRST", () => {
  const [stamp, recap] = buildWithDefaults("welcomeBackRecap");
  expect(stamp?.arms[0]).toMatchObject({ type: "set_variable", key: "lastBeatMs", op: "set", value: "{{expr::now.epochMs}}" });
  expect(stamp?.predicate).toBeNull();
  expect(recap?.triggerType).toBe("chatOpened");
  // The card, not a chip: a confirm-first arm STASHES at fire time and a HOST answers it.
  expect(recap?.arms[0]).toMatchObject({ type: "trigger_turn", confirmFirst: true });
});

test("#1's idle predicate is law-1 guarded — an absent stamp OFFERS the recap instead of throwing", () => {
  const preset = presetOf("welcomeBackRecap");
  const rules = preset.rules(resolveRulePresetKnobs(preset.knobs, { idleHours: 2 }));
  // 2h substituted as epoch-ms, and the `!has(...)` arm is what keeps a never-played room from THROWING
  // ("No such key") the first time it is opened.
  expect(rules[1]?.predicate).toBe("!has(vars.lastBeatMs) || int(now.epochMs) - int(vars.lastBeatMs) > 7200000");
  expect(evaluate(rules[1]?.predicate as string, EMPTY_ENV)).toBe(true);
  // POPULATED has no lastBeatMs either, so pin the negative arm explicitly: a FRESH stamp refuses.
  const fresh: CelBindings = { ...POPULATED_ENV, vars: { ...POPULATED_VARS, lastBeatMs: "1699999999000" } };
  expect(evaluate(rules[1]?.predicate as string, fresh)).toBe(false);
});

test("#3 auto-add lore is confirm-first BY DEFAULT, and the choice knob can turn the ask off", () => {
  const preset = presetOf("autoAddLore");
  expect(preset.confirmFirst).toBe(true);
  expect(buildWithDefaults("autoAddLore")[0]?.arms[0]).toMatchObject({ type: "insert_world_info_entry", confirmFirst: true });
  const written = preset.rules(resolveRulePresetKnobs(preset.knobs, { confirmFirst: "write" }));
  expect(written[0]?.arms[0]).toMatchObject({ type: "insert_world_info_entry", confirmFirst: false });
});

test("#8 opener chips are COMPOSE mode; #10's vote picks are SEND mode (authoring law 3's two halves)", () => {
  const opener = buildWithDefaults("openerChips")[0]?.arms[0];
  const vote = buildWithDefaults("callAVote")[0]?.arms[0];
  // The AUTHORED arm is the schema INPUT, where `mode` is optional until the parse fills it — so an
  // omitted mode reads as `undefined` here, which is exactly what these two decks must NOT do.
  const modesOf = (arm: AutomationActionInput | undefined): (string | undefined)[] =>
    arm?.type === "surface_quick_reply" ? arm.choices.map((c) => c.mode) : [];
  // A compose chip SEEDS the member's draft, so director shorthand ("Time skip") is legitimate there…
  expect(modesOf(opener)).toEqual(["compose", "compose", "compose"]);
  // …while a send chip becomes that member's LINE, so #10's picks are first-person and send-mode.
  expect(modesOf(vote)).toEqual(["send", "send", "send"]);
  const voteChoices = vote?.type === "surface_quick_reply" ? vote.choices : [];
  expect(voteChoices.every((c) => c.sendTemplate.startsWith("I "))).toBe(true);
});

test("#10 never fires on its own — its predicate is a constant false (the on-demand-only spelling)", () => {
  const [rule] = buildWithDefaults("callAVote");
  expect(rule?.predicate).toBe("false");
  // Both envs, because "never" is the claim: no bus event of its trigger can reach the arms.
  expect(evaluate(rule?.predicate as string, EMPTY_ENV)).toBe(false);
  expect(evaluate(rule?.predicate as string, POPULATED_ENV)).toBe(false);
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

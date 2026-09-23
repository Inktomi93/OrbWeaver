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
import { ANALYSIS_SCORE_MAX, automationActionsSchema, LIVE_TRIGGERS, NEEDLE_TENSION_VAR_KEY, RULE_PRESET_IDS } from "@orb/contracts/automation";
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
 *  host could actually mint. Today exactly one row needs it: #3 auto-add lore references a LOREBOOK through
 *  the `entityRef` knob kind (#630), which carries NO default by construction — no book is "the" book, and a
 *  reference with a default would ride `resolveKnob`'s unvalidated-default path into a mint. Keeping the map
 *  explicit means a preset that grows a required knob has to say so HERE, rather than quietly weakening a
 *  shared invariant. */
const REQUIRED_KNOBS: Partial<Record<RulePresetId, Readonly<Record<string, string>>>> = {
  autoAddLore: { bookId: mintTypeId(ID_PREFIX.worldBook) },
  // C2's lore distillers reference a lorebook through the SAME `entityRef` kind — no default by construction.
  distillLore: { bookId: mintTypeId(ID_PREFIX.worldBook) },
  rumorMill: { bookId: mintTypeId(ID_PREFIX.worldBook) },
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

test("the committed catalogue is exactly the A3 rows plus A4's four plus C1's pacing analysis plus C2's and C6's pairs, in §4 order", () => {
  // A3 landed the seven that ride the preset substrate alone; A4 adds #1 (welcome-back recap — the
  // confirm-first card), #3 (auto-add lore, confirm-first by default), #8 (the compose-mode opener deck,
  // riding A2's per-choice mode field) and #10 (call a vote — send-mode chips, R7-invoked); C1 adds #15
  // (story pacing analysis — the run_analysis arm's showcase, RULED F7 direct steer); C2 adds #11's two
  // confirm-first lore distillers (distill lore + rumour mill); #16 the needle rides C1's vars route +
  // the vars read proc; C3 adds #15's prose audit (the confirm-first rewrite card); C6 adds #2 (the
  // async table nudge, the actor-excluding recipient's consumer) and #14 (spotlight balance); C5 adds #20
  // (the living library), the one owner-GLOBAL row and the last committed one.
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
    "storyPacing",
    "distillLore",
    "rumorMill",
    "theNeedle",
    "proseAudit",
    "asyncTableNudge",
    "spotlightBalance",
    // C5 adds #20 (the living library) — the last of the 19 committed rows and its only owner-GLOBAL one.
    "livingLibrary",
    // §4 #17-#19 — the three OPTIONAL owner-picks (owner 2026-08-24: "everything optional gets included"),
    // pure catalogue additions over already-built arms (generate_image / trigger_turn / set_chat_background).
    // With them the §4 catalogue is complete: 22 rows, no committed id left unbuilt. Appended, never reordered.
    "illustrateOnLoreReveal",
    "reactToLoreActivation",
    "autoSetSceneBackground",
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

test("#655: every choice knob in the catalogue labels EVERY option it offers", () => {
  // `options` are wire values the builder branches on; without labels the picker's only honest render was
  // the raw value, so a host configuring a money-spending image rule chose between `scenario`, `background`
  // and `free`. A missing label also fails `tsc` at the def — this is the runtime half, over the erased
  // registry, and it also proves no preset ships an EXTRA label for an option it no longer offers.
  const labelled: string[] = [];
  for (const knob of RULE_PRESET_IDS.flatMap((id) => Object.values(presetOf(id).knobs))) {
    if (knob.kind !== "choice") {
      continue;
    }
    labelled.push(knob.label);
    expect(Object.keys(knob.optionLabels).toSorted()).toEqual([...knob.options].toSorted());
    expect(Object.values(knob.optionLabels).filter((label) => label.trim().length === 0)).toEqual([]);
  }
  // The denominator, so a catalogue that lost its choice knobs cannot print a clean zero here.
  expect(labelled).toEqual(["Before writing", "What to draw", "When it fills", "When to audit"]);
});

test("#655: the illustrate preset does not offer `free` — its every fire would be an action_error", () => {
  // `free` is the prompt-VERBATIM mode and this preset's arm carries no prompt, so `generatePicture` refuses
  // it outright (`domain/imagery/verbs/generate-picture.ts`: 'imagery: "free" mode requires a prompt'). It
  // was an offered option on a SPEND arm that could never once succeed. A prompt knob is not the alternative:
  // a present prompt SKIPS extraction, which is exactly what the two scene modes exist to do.
  const mode = presetOf("illustrateScenes").knobs["mode"];
  expect(mode?.kind).toBe("choice");
  expect(mode?.kind === "choice" ? mode.options : []).toEqual(["scenario", "background"]);
  expect(() => resolveRulePresetKnobs(presetOf("illustrateScenes").knobs, { mode: "free" })).toThrow();
});

test("the two-rule presets order the COUNTER above the THRESHOLD (position order is the same-batch mechanism)", () => {
  // The dispatch runs a chat's rules in position order over ONE shared, write-through env — so the counter
  // must be minted first or the threshold reads the pre-increment value for a whole batch.
  const clock = buildWithDefaults("clockFires");
  expect(clock[0]?.arms[0]).toMatchObject({ type: "set_variable", key: "clock", op: "inc" });
  // B9: R1 also PUBLISHES the threshold into the vars plane so the flank widget can render `filled/segments`
  // (the max is otherwise only a CEL literal in R2's predicate). Substituted from the `n` knob (default 4).
  expect(clock[0]?.arms[1]).toMatchObject({ type: "set_variable", key: "clockMax", op: "set", value: "4" });
  expect(clock[1]?.predicate).toContain("has(vars.clock)");

  const callback = buildWithDefaults("callback");
  expect(callback[0]?.arms.map((arm) => arm.type)).toEqual(["set_variable", "set_variable"]);
  expect(callback[1]?.arms.map((arm) => arm.type)).toEqual(["trigger_turn", "set_variable", "set_variable"]);
});

test("the callback anchors the beat through {{expr::…}} with law-2 coercion", () => {
  const [r1] = buildWithDefaults("callback");
  expect(r1?.arms[1]).toMatchObject({ type: "set_variable", key: "debtBeat", op: "set", value: "{{expr::int(chat.messageCount)}}" });
});

// ── A4's four rows ────────────────────────────────────────

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
  // The required lorebook reference rides along — it has no default to fall back to (#630).
  const written = preset.rules(resolveRulePresetKnobs(preset.knobs, { ...REQUIRED_KNOBS.autoAddLore, confirmFirst: "write" }));
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

// ── §4 #16 the needle (RULED 2026-08-24 — ships, OFF by default) ──────────────────────────────────────

test("#16 the needle authors ONLY the vars route — the def half of F6's wall", () => {
  // The RULING is "a published SCORE may cross into the member-visible vars plane; arcs, twists and guidance
  // NEVER do". The ENGINE holds that in three tiers (`engine/analysis-arm.ts`), and this is the preset's own
  // part: its arm enables `vars` and nothing else, so a pass has no steer route to store or deliver guidance
  // through, no lore route, and no card. A future edit adding `steer: {...}` here fails THIS assertion.
  const [read] = buildWithDefaults("theNeedle");
  const arm = read?.arms[0];
  expect(arm).toMatchObject({ type: "run_analysis", routes: { vars: { key: NEEDLE_TENSION_VAR_KEY } } });
  const routes = arm?.type === "run_analysis" ? arm.routes : {};
  expect(Object.keys(routes)).toEqual(["vars"]);
  // Nothing in the preset is confirm-class: a dial that asked permission to move would not be a dial.
  expect(presetOf("theNeedle").confirmFirst).toBe(false);
});

test("#16's reaction rule reads the score with law 1's guard and law 2's coercion, on the SAME cadence", () => {
  const preset = presetOf("theNeedle");
  const rules = preset.rules(resolveRulePresetKnobs(preset.knobs, { everyN: 4, threshold: 6 }));
  // Both knobs substituted as INT LITERALS, and the cadence rides BOTH rules — the score only moves on a
  // cadence beat, so reacting off one would re-run the backdrop's quiet pick against an unchanged value.
  expect(rules[0]?.predicate).toBe("(!has(event.turn) || int(event.turn.automationDepth) == 0) && int(chat.messageCount) % 4 == 0");
  expect(rules[1]?.predicate).toBe(
    "(!has(event.turn) || int(event.turn.automationDepth) == 0) && int(chat.messageCount) % 4 == 0 && has(vars.tension) && int(vars.tension) >= 6",
  );
  // Law 1 in the shape that matters: before the first pass lands there IS no score, and the unguarded read
  // would THROW "No such key" on every beat until then.
  expect(evaluate(rules[1]?.predicate as string, EMPTY_ENV)).toBe(false);
  // Past the threshold it fires; under it, it does not (messageCount 24 ⇒ 24 % 4 == 0 in both arms).
  const tense: CelBindings = { ...POPULATED_ENV, vars: { ...POPULATED_VARS, tension: "9" } };
  const calm: CelBindings = { ...POPULATED_ENV, vars: { ...POPULATED_VARS, tension: "2" } };
  expect(evaluate(rules[1]?.predicate as string, tense)).toBe(true);
  expect(evaluate(rules[1]?.predicate as string, calm)).toBe(false);
});

test("#16's threshold knob is bounded by the score's own scale — a 0 or an 11 is a typed refusal", () => {
  // The dial is 0..ANALYSIS_SCORE_MAX and the applier clamps to it, so a threshold outside that range would
  // mint a rule that either fires on every read or can never fire at all.
  const knobs = presetOf("theNeedle").knobs;
  expect(() => resolveRulePresetKnobs(knobs, { threshold: 0 })).toThrow();
  expect(() => resolveRulePresetKnobs(knobs, { threshold: ANALYSIS_SCORE_MAX + 1 })).toThrow();
  expect(() => resolveRulePresetKnobs(knobs, { threshold: ANALYSIS_SCORE_MAX })).not.toThrow();
});

// ── C6's two rows ────────────────────────────────────────────

test("#2 the async nudge orders the NUDGE above the STAMP — the inverse of the clock, same mechanism", () => {
  // The clock mints counter-then-threshold; this preset MUST mint threshold-then-counter. A chat's rules
  // dispatch in position order over one write-through env, so a stamp minted first would refresh the beat
  // time before the nudge's predicate read it and the measured gap would always be zero.
  const [nudge, stamp] = buildWithDefaults("asyncTableNudge");
  expect(nudge?.arms[0]).toMatchObject({ type: "post_notification", recipient: "all_members_except_actor" });
  expect(nudge?.cooldownSeconds).toBe(60); // the post_notification floor, or createRule refuses the mint
  expect(stamp?.predicate).toBeNull();
  expect(stamp?.arms[0]).toMatchObject({ type: "set_variable", key: "nudgeBeatMs", op: "set", value: "{{expr::now.epochMs}}" });
  expect(stamp?.maxFiresPerHour).toBe(RULE_MAX_FIRES_CAP); // law 4 — it stamps every beat
});

test("#2 rides messageCommitted on BOTH rules — turnCompleted's fact carries no author to exclude", () => {
  // Not a style choice: `all_members_except_actor` resolves against `event.message.authorUserId`, which a
  // turn fact does not populate. Under `turnCompleted` the arm would spare nobody and ping the poster.
  expect(buildWithDefaults("asyncTableNudge").map((rule) => rule.triggerType)).toEqual(["messageCommitted", "messageCommitted"]);
});

test("#2's idle predicate is law-1 guarded — the FIRST-EVER post nudges instead of throwing", () => {
  const preset = presetOf("asyncTableNudge");
  const rules = preset.rules(resolveRulePresetKnobs(preset.knobs, { idleHours: 2, quietFromHour: 0, quietUntilHour: 0 }));
  expect(rules[0]?.predicate).toBe("!has(vars.nudgeBeatMs) || int(now.epochMs) - int(vars.nudgeBeatMs) > 7200000");
  expect(evaluate(rules[0]?.predicate as string, EMPTY_ENV)).toBe(true);
  // …and a FRESH stamp refuses (the negative arm — the table is mid-conversation, nobody needs telling).
  const fresh: CelBindings = { ...POPULATED_ENV, vars: { ...POPULATED_VARS, nudgeBeatMs: "1699999999000" } };
  expect(evaluate(rules[0]?.predicate as string, fresh)).toBe(false);
});

test("#2's quiet hours build the WRAP shape, the same-day shape, and vanish when the window is empty", () => {
  const preset = presetOf("asyncTableNudge");
  const predicateFor = (quietFromHour: number, quietUntilHour: number): string =>
    preset.rules(resolveRulePresetKnobs(preset.knobs, { idleHours: 1, quietFromHour, quietUntilHour }))[0]?.predicate ?? "";
  // The default window spans midnight, so the awake clause is a CONJUNCTION — an OR there would be true at
  // every hour of the day and the quiet window would silently do nothing.
  const overnight = predicateFor(23, 8);
  expect(overnight).toContain("&& (int(now.hour) < 23 && int(now.hour) >= 8)");
  // A same-day window is the disjunction.
  expect(predicateFor(1, 7)).toContain("&& (int(now.hour) < 1 || int(now.hour) >= 7)");
  // Equal bounds = no quiet hours at all: the clause is absent rather than a tautology nobody can read.
  expect(predicateFor(0, 0)).not.toContain("now.hour");
  // And the idle disjunction is BRACKETED — unbracketed, the hour clause would bind to its second arm only.
  const quiet: CelBindings = { ...EMPTY_ENV, now: { epochMs: 1_700_000_000_000, hour: 2, dayOfWeek: 3 } };
  expect(evaluate(overnight, quiet)).toBe(false); // 02:00 UTC is inside 23→08, and there is no stamp at all
  expect(evaluate(overnight, EMPTY_ENV)).toBe(true); // 12:00 UTC is awake
});

test("#14 spotlight balance is a DIRECT-steer analysis pass whose brief steers the narrator, not the players", () => {
  const [rule] = buildWithDefaults("spotlightBalance");
  expect(rule?.triggerType).toBe("turnCompleted");
  expect(rule?.arms).toHaveLength(1);
  const analysis = rule?.arms[0];
  expect(analysis).toMatchObject({ type: "run_analysis", routes: { steer: { apply: "direct" } } });
  // ONE route: a steer-only pass cannot write lore, publish a score, or raise a card — the enabled routes ARE
  // the enforced response schema, so an un-authored route's field never exists to fill.
  expect(analysis?.type === "run_analysis" ? Object.keys(analysis.routes) : []).toEqual(["steer"]);
  // The narrator-not-players constraint, asserted on the shipped bytes rather than trusted to the comment.
  const brief = analysis?.type === "run_analysis" ? analysis.brief : "";
  expect(brief).toContain("NARRATOR");
  expect(brief).toContain("never address a player");
  expect(brief).toContain("say nothing"); // empty-is-the-common-case
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

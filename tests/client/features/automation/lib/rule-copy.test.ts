// The rules surface's host-facing COPY (rule-copy.ts) — the projections that turn wire values into
// sentences. Unit, not CT: these are pure functions over the wire shapes, and the browser adds nothing.
//
// What is pinned here is exactly what side-eye #621 found missing at the surface: no raw wire
// discriminator ever reaches a host (trigger + arm), a rule's own DESCRIPTION is what the row says it
// does, `lastFiredAt` becomes a sentence, `SPEND_ARM_TYPES` decides the spend affordance, a run-now
// outcome picks its notify CHANNEL (not "everything is a success toast"), and `FireView.detail` — never
// rendered before — becomes the answer the Run-now toast promises is in the fire log.

import { SPEND_ARM_TYPES } from "@orb/contracts/automation";
import { describe } from "vitest";
import {
  armLabel,
  fireDetailLine,
  hasSpendArm,
  lastRunLine,
  RULE_UNREADABLE_BADGE,
  ruleGloss,
  ruleUnreadableEnableRefusal,
  ruleUnreadableLine,
  ruleUnreadableRunRefusal,
  runOutcomeNotice,
  triggerLabel,
} from "../../../../../packages/client/src/features/automation/lib/rule-copy.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const CAPS = { cooldownSeconds: 45, maxFiresPerHour: 30 } as const;
/** A FIXED past epoch (test-determinism) — the phrase's unit ladder is kit/time's test, not this one. */
const A_PAST_INSTANT = 1_700_000_000_000;
const ELAPSED_PHRASE = /^Last ran .+\.$/u;
/** The unreadable rule's sentence with NO engine reason appended — the arm a corrupt rule renders until
 *  something dispatches it. Spelled once here so every arm below asserts the same words. */
const UNREADABLE_BASE = "This rule can't run — what it was told to do can no longer be read. Remove it and add the rule again.";

describe("triggerLabel", () => {
  test("renders a chat trigger as a phrase, never the wire discriminator", () => {
    expect(triggerLabel("turnCompleted")).toBe("after each reply");
    expect(triggerLabel("chatOpened")).toBe("when you open this chat");
  });

  test("renders a domain trigger too", () => {
    expect(triggerLabel("character.updated")).toBe("when a character is edited");
  });

  // A stored fire from an older vocabulary must still render its row rather than throw it away.
  test("falls back to the raw value for a discriminator it does not know", () => {
    expect(triggerLabel("someFutureTrigger")).toBe("someFutureTrigger");
  });
});

describe("hasSpendArm", () => {
  test("is true for exactly the contract's SPEND arms", () => {
    for (const type of SPEND_ARM_TYPES) {
      expect(hasSpendArm([{ type }])).toBe(true);
    }
  });

  test("is false for a rule whose arms are all free", () => {
    expect(hasSpendArm([{ type: "set_variable" }, { type: "surface_quick_reply" }])).toBe(false);
  });

  test("is true when ONE arm of several spends", () => {
    expect(hasSpendArm([{ type: "set_variable" }, { type: "generate_image" }])).toBe(true);
  });
});

describe("ruleGloss", () => {
  test("carries the rule's own description — the catalogue sentence the mint stores", () => {
    expect(
      ruleGloss({
        description: "Generate a picture of the current scene on a cadence, and post it into the room.",
        trigger: { type: "turnCompleted" },
        actions: [{ type: "generate_image" }],
      }),
    ).toBe("Generate a picture of the current scene on a cadence, and post it into the room.");
  });

  test("a hand-authored rule with no description gets WHEN + WHAT, never `turnCompleted · 1 action`", () => {
    const gloss = ruleGloss({ description: null, trigger: { type: "turnCompleted" }, actions: [{ type: "generate_image" }] });
    expect(gloss).toBe("Runs after each reply — generate an image.");
    expect(gloss).not.toContain("turnCompleted");
    expect(gloss).not.toContain("action");
  });

  test("names the first arm and counts the rest", () => {
    expect(ruleGloss({ description: "", trigger: { type: "chatOpened" }, actions: [{ type: "set_variable" }, { type: "post_notification" }] })).toBe(
      "Runs when you open this chat — set a variable, +1 more.",
    );
  });
});

describe("lastRunLine", () => {
  test("says so when a rule has never run", () => {
    expect(lastRunLine(null)).toBe("Hasn't run yet.");
  });

  test("renders an elapsed phrase for a rule that has", () => {
    // The relative phrase comes from the injected time seam; the pin is that the line USES it (the field
    // was on the view and rendered nowhere), not the exact unit ladder — that is kit/time's own test.
    expect(lastRunLine(A_PAST_INSTANT)).toMatch(ELAPSED_PHRASE);
  });
});

describe("runOutcomeNotice", () => {
  test("a refusal is a WARN, not a success (the notify seam's four channels)", () => {
    expect(runOutcomeNotice("Nudge", "predicate_false").channel).toBe("warn");
    expect(runOutcomeNotice("Nudge", "budget_refused").channel).toBe("warn");
    expect(runOutcomeNotice("Nudge", "depth_refused").channel).toBe("warn");
    expect(runOutcomeNotice("Nudge", "authority_refused").channel).toBe("warn");
    // D146-d — a PAUSED rule is healthy: its plugin is switched off, nothing broke and nothing was spent. It
    // belongs on the honest-degrade channel with the other refusals, never on `error`, and the line has to say
    // what to DO — sending a host to a fire log that is deliberately empty would be the worse answer.
    const paused = runOutcomeNotice("Nudge", "paused");
    expect(paused.channel).toBe("warn");
    expect(paused.line).toContain("plugin");
  });

  test("a broken arm or condition is an ERROR", () => {
    expect(runOutcomeNotice("Nudge", "action_error").channel).toBe("error");
    expect(runOutcomeNotice("Nudge", "predicate_error").channel).toBe("error");
  });

  test("only the arms that actually did something are SUCCESS", () => {
    expect(runOutcomeNotice("Nudge", "fired").channel).toBe("success");
    expect(runOutcomeNotice("Nudge", "suggested").channel).toBe("success");
    expect(runOutcomeNotice("Nudge", "test_run").channel).toBe("success");
  });

  test("the line names the rule", () => {
    expect(runOutcomeNotice("Illustrate the scene", "fired").line).toContain("Illustrate the scene");
  });
});

describe("fireDetailLine", () => {
  test("an action error names the arm, its position and the reason", () => {
    expect(fireDetailLine("action_error", { armIndex: 1, armType: "generate_image", error: "no image connection is configured" }, CAPS)).toBe(
      "Couldn't generate an image (step 2): no image connection is configured",
    );
  });

  test("a thrown arm with no armType still surfaces the reason", () => {
    expect(fireDetailLine("action_error", { error: "boom" }, CAPS)).toBe("An action failed: boom");
  });

  test("a rate cap answers WHICH cap, and dates its number to NOW rather than to the row (#1502)", () => {
    // The row records which limit refused and NOTHING about the threshold then in force, so the number can
    // only ever describe the rule's CURRENT setting. Phrasing it as the historical count made every past
    // refusal re-read itself whenever a host changed the cap.
    expect(fireDetailLine("budget_refused", { limit: "rule_hourly" }, CAPS)).toBe("It had already hit its own hourly cap — now 30 per hour.");
    expect(fireDetailLine("budget_refused", { limit: "cooldown" }, CAPS)).toBe("Its cooldown hadn't elapsed — it now runs at most once every 45s.");
    expect(fireDetailLine("budget_refused", { limit: "chat_hourly" }, CAPS)).toBe("This chat had already hit its hourly cap across all rules.");
    // The past clause must survive on its own: with no caps to quote (the room-wide activity log) the
    // sentence still says what happened, and it is the SAME claim the numbered arm now makes.
    expect(fireDetailLine("budget_refused", { limit: "rule_hourly" }, null)).toBe("It had already hit its own hourly cap.");
  });

  test("a condition error carries the CEL reason", () => {
    expect(fireDetailLine("predicate_error", { error: "unknown identifier 'foo'" }, CAPS)).toBe("Its condition errored: unknown identifier 'foo'");
  });

  test("a manual fire says a human did it; an ordinary fire adds nothing", () => {
    expect(fireDetailLine("fired", { runNow: true, byUserId: "user_1" }, CAPS)).toBe("You ran this by hand.");
    expect(fireDetailLine("fired", null, CAPS)).toBeNull();
  });

  test("a dry run reports the predicate verdict it stored", () => {
    expect(fireDetailLine("test_run", { predicate: true, arms: [] }, CAPS)).toContain("would have matched");
    expect(fireDetailLine("test_run", { predicate: false, arms: [] }, CAPS)).toContain("would NOT have matched");
  });

  test("an authority refusal explains the host handoff", () => {
    expect(fireDetailLine("authority_refused", { code: "author-lost-authority" }, CAPS)).toContain("no longer hosts this chat");
  });

  test("a detail-less row adds no line at all (the badge already says it)", () => {
    expect(fireDetailLine("predicate_false", null, CAPS)).toBeNull();
  });
});

describe("armLabel", () => {
  test("names what the arm does, never its wire discriminator", () => {
    expect(armLabel("trigger_turn")).toBe("ask for a reply");
    expect(armLabel("set_chat_background")).toBe("change the background");
    // The quiet pass is labelled by what the host FEELS it doing, never "analysis" (wire vocabulary).
    expect(armLabel("run_analysis")).toBe("study the story");
    // The open-world arm is labelled by its ACT, not its payload: WHICH tool lives in the arm's `name` field,
    // and a label that leaked `run_tool` would put the wire discriminator on the one surface built to hide it.
    expect(armLabel("run_tool")).toBe("run a tool");
  });
});

// ── #1558 / #1655 — the UNREADABLE rule's copy (#1665) ──────────────────────────────────────────────
// This family shipped with a CT that only ever fed it a non-empty `lastError`, so `ruleUnreadableLine`'s
// BASE arm — the one a corrupt rule that never dispatched actually renders, because `lastError` is `null`
// until an event fires — was reachable in production and exercised by nothing, and the badge + the two
// refusals had no pin at all. `test-presence` was green the whole time: this file EXISTED. What the copy
// SAYS is the product here (a host is told what is true of their rule and the one move that fixes it), so
// each arm is asserted verbatim rather than by a phrase match.

describe("the unreadable-rule copy", () => {
  test("ruleUnreadableLine states the fault and the remedy with NO engine reason when the rule never dispatched", () => {
    // `lastError: null` is the production state of a corrupt rule no event has reached yet — the server's
    // auto-disable writes that field, and it only runs on a dispatch.
    expect(ruleUnreadableLine(null)).toBe(UNREADABLE_BASE);
  });

  test("an empty or whitespace-only lastError is the SAME as none — never a dangling 'reported:' clause", () => {
    expect(ruleUnreadableLine("")).toBe(UNREADABLE_BASE);
    expect(ruleUnreadableLine("   ")).toBe(UNREADABLE_BASE);
    expect(ruleUnreadableLine("\n\t ")).toBe(UNREADABLE_BASE);
  });

  test("a real lastError is APPENDED verbatim — it is the one concrete detail a host can quote for help", () => {
    expect(ruleUnreadableLine("auto-disabled: corrupt actions blob")).toBe(`${UNREADABLE_BASE} Its last run reported: auto-disabled: corrupt actions blob`);
    // Untrimmed on purpose: what the engine wrote is what the host is shown.
    expect(ruleUnreadableLine(" spaced ")).toBe(`${UNREADABLE_BASE} Its last run reported:  spaced `);
  });

  test("the badge is a WORD, not intent colour alone", () => {
    expect(RULE_UNREADABLE_BADGE).toBe("Can't run");
  });

  test("both refusals name the rule and state the REFUSAL, not the action", () => {
    expect(ruleUnreadableEnableRefusal("Illustrate the scene")).toBe(`Can't enable "Illustrate the scene" — its saved actions can't be read`);
    expect(ruleUnreadableRunRefusal("Illustrate the scene")).toBe(`Can't run "Illustrate the scene" — its saved actions can't be read`);
    // The two doors are answers to ONE question (#1655): same grammar, same reason, differing only in the
    // verb. A surface that refused to switch a rule on while offering to run it said two things about one
    // rule — so the shared tail is asserted as shared, not twice by coincidence.
    const tail = " — its saved actions can't be read";
    expect(ruleUnreadableEnableRefusal("Nudge").endsWith(tail)).toBe(true);
    expect(ruleUnreadableRunRefusal("Nudge").endsWith(tail)).toBe(true);
  });
});

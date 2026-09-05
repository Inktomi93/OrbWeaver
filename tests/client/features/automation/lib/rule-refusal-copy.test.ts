// The rule row's REFUSALS (rule-refusal-copy.ts) — what a host is told when a control on the row cannot do
// what it says. Unit, not CT: these are pure functions over the wire shapes, and the browser adds nothing
// (the RENDERED half — that the door is `aria-disabled`, carries the reason on `title`, and performs
// nothing — is pinned in `components/rules-section.ct.tsx`, which is where the affordance lives).
//
// All three refusals are the #924 dead-end class: a door whose every branch fails. What a unit can own is
// the predicate that decides WHICH rule is which, and that the sentences speak the host's words rather than
// the wire's — no `actionsCorrupt`, no `transform_not_runnable`, no "corrupt".

import { describe } from "vitest";
import {
  isTransformOnlyRule,
  RULE_UNREADABLE_BADGE,
  ruleTransformOnlyRunRefusal,
  ruleUnreadableEnableRefusal,
  ruleUnreadableLine,
  ruleUnreadableRunRefusal,
} from "../../../../../packages/client/src/features/automation/lib/rule-refusal-copy.ts";
import { expect, test } from "../../../../support/fixtures.ts";

describe("isTransformOnlyRule", () => {
  test("a rule whose every arm rewrites the draft is transform-only", () => {
    expect(isTransformOnlyRule([{ type: "transform_draft" }])).toBe(true);
    expect(isTransformOnlyRule([{ type: "transform_draft" }, { type: "transform_draft" }])).toBe(true);
  });

  test("an EMPTY arm list is not — which is what keeps an unreadable rule out of this arm", () => {
    // `actions` projects to `[]` for BOTH an unparseable blob and a rule nobody has added an arm to, and a
    // bare `every` is vacuously true on an empty list: without the length guard both would be told they
    // rewrite a draft. The corrupt rule has its OWN refusal and must reach it.
    expect(isTransformOnlyRule([])).toBe(false);
  });

  test("a mixed or dispatchable rule is not — the door stays open on anything the engine can run", () => {
    expect(isTransformOnlyRule([{ type: "trigger_turn" }])).toBe(false);
    expect(isTransformOnlyRule([{ type: "transform_draft" }, { type: "trigger_turn" }])).toBe(false);
  });
});

describe("the refusal sentences", () => {
  test("every door opens the same way — one grammar across the three, naming the rule", () => {
    // One grammar is the point of #1655: the enable control's refusal and the two Run-now refusals are
    // answers to the same question, so a host meets the same sentence shape whichever door they try.
    expect(ruleUnreadableEnableRefusal("Broken watcher")).toBe(`Can't enable "Broken watcher" — its saved actions can't be read`);
    expect(ruleUnreadableRunRefusal("Broken watcher")).toBe(`Can't run "Broken watcher" — its saved actions can't be read`);
    expect(ruleTransformOnlyRunRefusal("Polish my draft")).toContain(`Can't run "Polish my draft" — `);
  });

  test("the transform refusal says what is true of the RULE, never the wire code", () => {
    const refusal = ruleTransformOnlyRunRefusal("Polish my draft");
    expect(refusal).toContain("rewrites your draft");
    expect(refusal).toContain("nothing to run out of turn");
    // `transform_not_runnable` / `transform_draft` are the server's and the wire's words; a host gets neither.
    expect(refusal).not.toContain("transform");
  });

  test("the badge is a WORD, and the sentence names the one move that fixes it", () => {
    expect(RULE_UNREADABLE_BADGE).toBe("Can't run");
    const line = ruleUnreadableLine(null);
    expect(line).toContain("can no longer be read");
    // There is no in-app repair for a blob the schema rejects, so the copy must not imply one.
    expect(line).toContain("Remove it and add the rule again");
    expect(line).not.toContain("corrupt");
  });

  test("the engine's own reason rides the sentence when there is one — and never a blank tail when there isn't", () => {
    expect(ruleUnreadableLine("actions: invalid discriminator value")).toContain("Its last run reported: actions: invalid discriminator value");
    // A whitespace-only `lastError` is the same as none: it must not produce a dangling "reported:".
    expect(ruleUnreadableLine("   ")).toBe(ruleUnreadableLine(null));
  });
});

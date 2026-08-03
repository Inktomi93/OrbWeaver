// Cross-source at-depth collision ordering — the deterministic interleave when persona-note, char-note,
// user-injection, and world-info all land as `in_chat` injections at ONE shared depth (and the cross-depth
// stratification when they don't). Each source is individually covered elsewhere; NOTHING pins what happens
// when several collide at the same depth — yet that is exactly the byte-order the KV cache + the model's
// reading order depend on. The tie-order rule is DOCUMENTED in `spliceInChatInjections` (assembly/
// injections.ts): primary depth DESC (deepest splices furthest from the tail), secondary `order` ASC
// (LOWER `order` lands first/top within a depth — ST parity), stable for equal keys, absent `order` ⇒ 100.
//
// This drives the REAL assembly splice (and the real `shape` SHAPE composition that orchestrates it) — the
// one home of the order, per the file's "one home, can't drift" note. The four sources are modeled as the
// `ChatInjection`s the BUILD stage converts each into (their relative `order` is preset DATA assigned at
// BUILD; the INVARIANT under test is the splice's deterministic collation of them). A reordered sort key
// (depth ASC, or order ASC) flips these sequences → the suite is non-vacuous.

import type { ChatInjection } from "@orb/contracts/chat";
import { describe } from "vitest";
import { spliceInChatInjections } from "../../../../../packages/server/src/domain/chat/assembly/injections.ts";
import { shape } from "../../../../../packages/server/src/domain/chat/assembly/shape.ts";
import { expect, test } from "../../../../support/fixtures.ts";

/** The four cross-source markers — each source contributes ONE `in_chat` injection carrying a unique tag. */
const WI = "MARK_WI";
const USER_INJ = "MARK_USER_INJECTION";
const CHAR_NOTE = "MARK_CHAR_NOTE";
const PERSONA_NOTE = "MARK_PERSONA_NOTE";

// The BUILD-assigned `order` per source (DATA). ST parity: LOWER `order` lands first/top within a depth,
// so persona-note (100) sits highest and WI (400) closest to the tail — legible in the output below.
const ORDER = { [WI]: 400, [USER_INJ]: 300, [CHAR_NOTE]: 200, [PERSONA_NOTE]: 100 } as const;

/** A `user`-role in_chat injection (frames to `[Note from user: …]`, so the marker survives as a substring). */
function inj(mark: keyof typeof ORDER, depth: number): ChatInjection {
  return { position: "in_chat", depth, role: "user", content: mark, order: ORDER[mark] };
}

/** Map each spliced row to the marker it carries (or "canon:<content>" for an original history row). */
function labels(rows: readonly { role: string; content: string }[]): string[] {
  const marks = [WI, USER_INJ, CHAR_NOTE, PERSONA_NOTE];
  return rows.map((r) => marks.find((m) => r.content.includes(m)) ?? `canon:${r.content}`);
}

describe("spliceInChatInjections — four sources colliding at ONE shared depth", () => {
  test("at a shared depth they collate by `order` ASC — lowest order lands top (persona → char → user → WI)", () => {
    // A two-row canon; every source injects at depth 1 (one slot before the trailing turn).
    const history = [
      { role: "user" as const, content: "U1" },
      { role: "assistant" as const, content: "A1" },
    ];
    const injections = [
      // Deliberately NOT in priority order — the splice must sort, not preserve array order.
      inj(PERSONA_NOTE, 1),
      inj(WI, 1),
      inj(CHAR_NOTE, 1),
      inj(USER_INJ, 1),
    ];

    const out = spliceInChatInjections(history, injections);

    // The four land between U1 and A1, top-to-bottom in `order` ASC (LOWER order = nearer the top — ST parity).
    expect(labels(out)).toEqual(["canon:U1", PERSONA_NOTE, CHAR_NOTE, USER_INJ, WI, "canon:A1"]);
  });

  test("equal `order` at a shared depth is STABLE (array order preserved — no nondeterministic shuffle)", () => {
    const history = [{ role: "assistant" as const, content: "A1" }];
    const flat = (mark: string): ChatInjection => ({
      position: "in_chat",
      depth: 1,
      role: "user",
      content: mark,
      order: 100,
    });
    // All four at the same depth AND same order — the stable sort must keep the authored array order.
    const injections = [flat(CHAR_NOTE), flat(WI), flat(PERSONA_NOTE), flat(USER_INJ)];

    const out = spliceInChatInjections(history, injections);

    expect(labels(out)).toEqual([CHAR_NOTE, WI, PERSONA_NOTE, USER_INJ, "canon:A1"]);
  });
});

describe("spliceInChatInjections — cross-depth stratification", () => {
  test("depth DESC dominates `order`: a deeper LOW-order note outranks a shallow HIGH-order one", () => {
    // A four-row canon so depths 0..3 need no clamp.
    const history = [
      { role: "user" as const, content: "U1" },
      { role: "assistant" as const, content: "A1" },
      { role: "user" as const, content: "U2" },
      { role: "assistant" as const, content: "A2" },
    ];
    // WI @ depth3 (deepest → furthest from tail), user-inj @2, char-note @1, persona-note @0 (the tail).
    const injections = [inj(PERSONA_NOTE, 0), inj(CHAR_NOTE, 1), inj(USER_INJ, 2), inj(WI, 3)];

    const out = spliceInChatInjections(history, injections);

    // Each injection lands `depth` slots back from the ORIGINAL tail (insertAt = len - depth): WI@3 is the
    // deepest (furthest from the tail, right after U1), persona-note@0 lands at the very tail. The four
    // stratify strictly by depth regardless of their `order` — a deeper note always precedes a shallower one.
    expect(labels(out)).toEqual(["canon:U1", WI, "canon:A1", USER_INJ, "canon:U2", CHAR_NOTE, "canon:A2", PERSONA_NOTE]);
  });
});

describe("shape — the same collision through the real SHAPE composition (end-to-end wire history)", () => {
  test("the four-source shared-depth order survives squash + name-stamp into the delivered history", () => {
    const out = shape({
      canon: [
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi there", characterId: null },
      ],
      appendUserTurn: null,
      injections: [inj(PERSONA_NOTE, 1), inj(WI, 1), inj(CHAR_NOTE, 1), inj(USER_INJ, 1)],
      output: "per-speaker",
      cardScope: "merged",
      scopedTargetId: null,
      namesBehavior: "none",
      speakers: { user: "You", assistant: "Aria" },
      groupNudge: null,
    });

    // The injected stage preserves the depth-1 `order`-ASC collation; the four user-role notes squash with
    // the leading user turn but their RELATIVE order is intact top-to-bottom (persona → char → user → WI — ST parity).
    const wiAt = out.stages.injected.findIndex((r) => r.content.includes(WI));
    const userAt = out.stages.injected.findIndex((r) => r.content.includes(USER_INJ));
    const charAt = out.stages.injected.findIndex((r) => r.content.includes(CHAR_NOTE));
    const personaAt = out.stages.injected.findIndex((r) => r.content.includes(PERSONA_NOTE));
    expect(personaAt).toBeGreaterThanOrEqual(0);
    expect(personaAt).toBeLessThan(charAt);
    expect(charAt).toBeLessThan(userAt);
    expect(userAt).toBeLessThan(wiAt);
  });
});

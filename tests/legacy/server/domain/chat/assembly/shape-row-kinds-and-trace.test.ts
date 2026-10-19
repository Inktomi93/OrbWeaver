// SHAPE substrate — the delivered-row trace, the row-kind prompt policy, narrator delivery, the new-chat marker and cued rounds.

import type { AssembleContext, MessageView } from "@orb/contracts/chat";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { CharacterId, MessageId, PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { RowCharacterName, RowPersonaName } from "@orb/kit/macro";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import type { HistoryMacroNames } from "./_shape-support.ts";
import { ARIA, BEFORE_HISTORY_DEPTH, GROUP_ID, inChat, KAI, pinnedRow, shape, soloInput, toShapeCanon } from "./_shape-support.ts";

// ── The DELIVERED-ROW TRACE (`stages.delivered` → `ShapeTrace.rows`) ────────────────────────────────────
//
// RPG-NO-PROMPT-DEBUG: the shape trace projected stage COUNTS only, so block order/role/voice was
// reconstructed by hand from wire captures. These pin the projection itself — and specifically that a squash
// which folds an assembled row into a canon turn reports `merged` rather than inheriting `canon`, which is the
// only way the INJECT-NAMED-AS-PLAYER shape is visible on a debug surface.

const MSG_GREETING = castId<MessageId>("message_greeting");
const MSG_U1 = castId<MessageId>("message_u1");
const MSG_TIP = castId<MessageId>("message_tip");

/** SOLO_CANON with the message ids a real `toShapeCanon` load stamps — the provenance discriminator. */
const STORED_CANON = [
  { role: "assistant" as const, content: "greeting", authorName: "Aria", characterId: ARIA, messageId: MSG_GREETING },
  { role: "user" as const, content: "u1", authorName: "Alex", messageId: MSG_U1 },
  { role: "assistant" as const, content: "a1 tip", authorName: "Aria", characterId: ARIA, messageId: MSG_TIP },
];

describe("shape — the delivered-row trace", () => {
  test("a clean send projects one row per delivered row, in order, with role + voice + size", () => {
    const out = shape(soloInput({ canon: STORED_CANON }));

    // The projection is index-aligned with the wire it describes — the invariant every reading of this
    // surface rests on (row 3 in the panel IS wire row 3).
    expect(out.stages.delivered).toHaveLength(out.history.length);
    expect(out.stages.delivered.map((row) => row.chars)).toEqual(out.history.map((row) => row.content.length));
    expect(out.stages.delivered.map((row) => row.role)).toEqual(out.history.map((row) => row.role));

    expect(out.stages.delivered).toEqual([
      { role: "assistant", name: "Aria", source: "canon", chars: "greeting".length },
      // `chars` is the DELIVERED length: names=default inlined "Alex: " into this row, and the readout must
      // report what rides the wire, not the stored body.
      { role: "user", name: "Alex", source: "canon", chars: "Alex: u1".length },
      { role: "assistant", name: "Aria", source: "canon", chars: "a1 tip".length },
      // The synthetic turn a regen/continue appends is stored nowhere — `assembled`, not `canon`.
      { role: "user", source: "assembled", chars: "u2 volatile".length },
    ]);
  });

  test("INJECT-NAMED-AS-PLAYER's tell: a demoted system note folded into the player's turn reports MERGED", () => {
    // The live shape: a backend without mid-conversation system support demotes a
    // depth-0 system injection to a user note, and the same-role squash folds it into the player's own turn.
    // The delivered row is then ONE user row whose bytes are half the player's and half the game's — which a
    // stage count cannot show and which reporting the head's `canon` provenance would actively hide.
    const out = shape(
      soloInput({
        canon: STORED_CANON.slice(0, 2),
        appendUserTurn: null,
        injections: [inChat({ depth: 0, role: "system", content: "# Game state\nHP 24/30" })],
      }),
    );

    const last = out.stages.delivered.at(-1);
    expect(last?.role).toBe("user");
    expect(last?.source).toBe("merged");
    // …and it still wears the PLAYER's name, which is the defect this readout makes visible.
    expect(last?.name).toBe("Alex");
    // The wire agrees: one row, both bodies.
    expect(out.history.at(-1)?.content).toContain("u1");
    expect(out.history.at(-1)?.content).toContain("HP 24/30");
  });

  test("a capability-kept depth-0 system row stays its own UNNAMED row (no speaker to misattribute)", () => {
    const out = shape(
      soloInput({
        canon: STORED_CANON.slice(0, 2),
        appendUserTurn: null,
        midConversationSystem: true,
        roleHandlingFloor: "slotted",
        injections: [inChat({ depth: 0, role: "system", content: "operator channel" })],
      }),
    );

    const systemRow = out.stages.delivered.find((row) => row.role === "system");
    expect(systemRow).toEqual({ role: "system", source: "assembled", chars: "operator channel".length });
    // The player's turn is untouched beside it — no merge, so it stays plain canon.
    expect(out.stages.delivered.find((row) => row.role === "user")?.source).toBe("canon");
  });

  test("the continuation nudge is reported as assembled, never as the last canon turn", () => {
    // A canon ending on assistant gets `[Continue the conversation.]` appended; it is assembly's own row.
    const out = shape(soloInput({ canon: STORED_CANON, appendUserTurn: null }));

    expect(out.history.at(-1)?.content).toBe("[Continue the conversation.]");
    expect(out.stages.delivered.at(-1)).toEqual({ role: "user", source: "assembled", chars: "[Continue the conversation.]".length });
  });

  test("under a NON-merging strategy every delivered row keeps its own provenance (nothing collapses)", () => {
    const out = shape(
      soloInput({
        canon: STORED_CANON.slice(0, 2),
        appendUserTurn: null,
        roleHandling: "none",
        roleHandlingFloor: "none",
        injections: [inChat({ depth: 0, role: "user", content: "steer" })],
      }),
    );

    expect(out.stages.delivered.map((row) => row.source)).toEqual(["canon", "canon", "assembled"]);
  });
});

// ── THE ROW-PURPOSE DISPATCHES (D129 §G — the SHAPE half of the fan-out) ────────────────────────────────
//
// Each test here fails the moment a site goes back to inferring purpose from role × attribution × the room's
// dial. Before this landed: `MESSAGE_KIND_POLICY.comment.prompt === "never"` was enforced by nothing (a
// comment row shipped to the model), the `<speaker>` strip ran on EVERY assistant row on the theory that
// tag-absence is the same claim as "not narrator", and the name-stamp put ONE identity's label on a
// multi-speaker narrator block.

const KIND_CTX: AssembleContext =
  {
    character: { name: "Aria", description: "" },
    characters: [{ name: "Group", description: "" }],
    characterIds: [GROUP_ID],
    recentMessages: [],
    promptConfig: DEFAULT_PROMPT_CONFIG,
    activePersonaUserId: null,
  } as unknown as AssembleContext;

const KIND_NAMES: HistoryMacroNames = {
  characterNamesById: new Map<CharacterId, RowCharacterName>([[GROUP_ID, { name: "Group" }]]),
  personaNamesById: new Map<PersonaId, RowPersonaName>(),
};

let kindSeq = 0;
/** A canon row that DECLARES its purpose — the only axis these tests vary. */
function kindRow(over: Partial<MessageView> & { readonly kind: MessageView["kind"] }): MessageView {
  kindSeq += 1;
  return {
    id: castId<MessageId>(`message_kind_${kindSeq}`),
    seq: kindSeq,
    role: "assistant",
    content: "body",
    authorUserId: null,
    characterId: GROUP_ID,
    personaId: null,
    excludedFromPrompt: false,
    ...over,
  } as unknown as MessageView;
}

describe("toShapeCanon — the PROMPT-POLICY dispatch (kind decides admission, not a truthiness guess)", () => {
  test("a `comment` row NEVER reaches the wire; `standard` and `narrator` both do", () => {
    const canon = [
      kindRow({ kind: "standard", content: "in character" }),
      kindRow({ kind: "comment", content: "OOC: brb, dog" }),
      kindRow({ kind: "narrator", content: "the door opens" }),
    ];
    const rows = toShapeCanon(canon, KIND_CTX, KIND_NAMES, null);
    expect(rows.map((r) => r.content)).toEqual(["in character", "the door opens"]);
  });

  test("the drop survives to the DELIVERED wire — a comment is not merely unlabelled, it is absent", () => {
    const out = shape(
      soloInput({
        canon: toShapeCanon(
          [kindRow({ kind: "standard", content: "in character" }), kindRow({ kind: "comment", content: "OOC: brb, dog" })],
          KIND_CTX,
          KIND_NAMES,
          null,
        ),
        appendUserTurn: null,
        namesBehavior: "content",
      }),
    );
    expect(out.history.some((r) => r.content.includes("OOC"))).toBe(false);
  });

  test("kind rides onto the delivered-row TRACE, so a host can see WHY a row shipped the way it did", () => {
    const out = shape(
      soloInput({
        canon: toShapeCanon([kindRow({ kind: "narrator", content: "the door opens" })], KIND_CTX, KIND_NAMES, null),
        appendUserTurn: null,
      }),
    );
    // The canon row declares narrator; the continuation nudge assembly appends declares nothing (no slot).
    expect(out.stages.delivered.map((r) => r.kind)).toEqual(["narrator", undefined]);
  });
});

describe("the `<speaker>` strip is GATED ON KIND, not applied blind to every assistant row", () => {
  const tagged = "<speaker>Kai</speaker> I'm here.";

  test("a NARRATOR row's tags convert to the plain `NAME:` attribution the wire speaks", () => {
    const rows = toShapeCanon([kindRow({ kind: "narrator", content: tagged })], KIND_CTX, KIND_NAMES, null);
    expect(rows[0]?.content).toBe("Kai: I'm here.");
  });

  test("a STANDARD row's identical bytes are left ALONE — an author's own `<speaker>` prose is not attribution", () => {
    const rows = toShapeCanon([kindRow({ kind: "standard", content: tagged })], KIND_CTX, KIND_NAMES, null);
    expect(rows[0]?.content).toBe(tagged);
  });
});

// ── NARRATOR DELIVERY IS ASSISTANT ON EVERY WIRE (the D129(B) delivered-role dispatch, RULED OUT) ─────
// OWNER RULING 2026-08-18, verbatim: "if you mean group chat narration mode then that is the wrong
// behavior." Group-chat narration mode is ONE generation voicing every seated character — it is the assistant's own
// OUTPUT voice, not an operator/system channel, so it delivers as an `assistant` row on every wire including
// a measured one. The `turns.historySystemRows` MEASUREMENT is honored and stands (the vLLM cell is real and
// the injection SPLICE still reads it, above); what the owner ruled wrong is the SEMANTICS of routing
// narrator canon through that bit.
//
// So these pins run the SAME narrator canon under both capability profiles and demand ONE wire. The
// defect-grade red is the `true` arm: against the pre-ruling `shape.ts` the row ships `system` and the
// assertion fails, which is the ruled-out behavior itself.
describe("shape — a NARRATOR row delivers ASSISTANT on every wire (owner ruling 2026-08-18)", () => {
  const narratorCanon = (): readonly ReturnType<typeof toShapeCanon>[number][] =>
    toShapeCanon(
      [kindRow({ kind: "narrator", content: "The lamp gutters." }), kindRow({ kind: "standard", content: "one voice" })],
      KIND_CTX,
      KIND_NAMES,
      null,
    );

  test("MEASURED wire (historySystemRows true): the narrator row is STILL assistant — no system row anywhere", () => {
    const out = shape(soloInput({ canon: narratorCanon(), appendUserTurn: null, historySystemRows: true }));
    expect(out.history.some((r) => r.role === "system")).toBe(false);
    // Assistant-voiced, and therefore squash-eligible with the standard row beside it, exactly as on every
    // unmeasured wire.
    expect(out.history.find((r) => r.role === "assistant")?.content).toBe("The lamp gutters.\n\none voice");
  });

  test("the capability bit does not reach narrator delivery: true / false / absent produce the IDENTICAL wire", () => {
    const canon = narratorCanon();
    const on = shape(soloInput({ canon, appendUserTurn: null, historySystemRows: true }));
    const off = shape(soloInput({ canon, appendUserTurn: null, historySystemRows: false }));
    const unset = shape(soloInput({ canon, appendUserTurn: null }));
    expect(on.history).toEqual(off.history);
    expect(unset.history).toEqual(off.history);
    // CANON is untouched by either run (the §14 provider-independence invariant at this seam).
    expect(canon.map((r) => `${r.role}:${r.content}`)).toEqual(["assistant:The lamp gutters.", "assistant:one voice"]);
  });

  test("a narrator row is assistant-and-unlabelled on a measured wire too (the label policy is kind, unchanged)", () => {
    for (const namesBehavior of ["content", "completion", "default"] as const) {
      const canon = toShapeCanon([kindRow({ kind: "narrator", content: "The lamp gutters." })], KIND_CTX, KIND_NAMES, null);
      const out = shape(soloInput({ canon, appendUserTurn: null, historySystemRows: true, namesBehavior }));
      const row = out.history.find((r) => r.role === "assistant");
      // No "Group: " (the synthetic card's name), no completion `name`, and the row is in the ASSISTANT
      // voice — the measured capability reaches neither the label policy nor the delivered role.
      expect(row?.content).toBe("The lamp gutters.");
      expect(row?.name).toBeUndefined();
    }
  });

  test("the ends-on-user invariant still holds around the SURVIVING system producer (a depth-0 injection)", () => {
    // The splice is the only thing that can put a `system` row in the delivered history now. The tail check
    // reads the last NON-system row, so a canon ending on assistant still earns its continuation nudge with a
    // capability-kept system row sitting after it.
    const out = shape(
      soloInput({
        canon: narratorCanon(),
        appendUserTurn: null,
        injections: [inChat({ role: "system", content: "GM note" })],
        midConversationSystem: true,
        roleHandlingFloor: "slotted",
      }),
    );
    // The cue lands before the kept system row, so the last NON-system row is the user cue.
    expect(out.history.at(-1)?.role).toBe("system");
    expect(out.history.at(-2)?.role).toBe("user");
  });

  test("a `comment` row is still DROPPED on a measured wire — no capability resurrects one", () => {
    const canon = toShapeCanon([kindRow({ kind: "comment", content: "OOC: brb, dog" })], KIND_CTX, KIND_NAMES, null);
    const out = shape(soloInput({ canon, appendUserTurn: null, historySystemRows: true }));
    expect(out.history.some((r) => r.content.includes("OOC"))).toBe(false);
  });

  test("the EGOCENTRIC FOLD is unaffected: a folded narrator row is a participant `user` line", () => {
    // The scoped fold rewrites another character's row into a `user` line addressed to the target and
    // deliberately KEEPS its kind. It was the one guard the ruled-out dispatch needed; the fold's own
    // behavior is independent of the capability and stays pinned.
    const other = castId<CharacterId>("character_other_speaker");
    const canon = toShapeCanon([kindRow({ kind: "narrator", content: "The lamp gutters.", characterId: other })], KIND_CTX, KIND_NAMES, null);
    const out = shape(
      soloInput({ canon, appendUserTurn: null, historySystemRows: true, output: "per-speaker", cardScope: "scoped", scopedTargetId: GROUP_ID }),
    );
    expect(out.history.some((r) => r.role === "system")).toBe(false);
    expect(out.history.some((r) => r.role === "user" && r.content.includes("The lamp gutters."))).toBe(true);
  });
});

describe("applyNamesBehavior — the LABEL policy is the row's kind (a narrator block is never one identity's line)", () => {
  const narratorBody = "Kai: I'm here.\nThe lamp gutters.";

  for (const namesBehavior of ["content", "completion", "default"] as const) {
    test(`names=${namesBehavior}: a narrator row takes NO row-level speaker label`, () => {
      const out = shape(
        soloInput({
          canon: toShapeCanon([kindRow({ kind: "narrator", content: narratorBody })], KIND_CTX, KIND_NAMES, null),
          appendUserTurn: null,
          namesBehavior,
        }),
      );
      const row = out.history.find((r) => r.role === "assistant");
      // The body rides verbatim: no "Group: " (the synthetic card's name), no "Aria: " (the turn's assistant
      // fallback once that card does not resolve), and no out-of-band completion `name` either.
      expect(row?.content).toBe(narratorBody);
      expect(row?.name).toBeUndefined();
    });
  }

  test("a STANDARD row in the same room still takes its label (the policy narrows, it does not disable)", () => {
    const out = shape(
      soloInput({
        canon: toShapeCanon([kindRow({ kind: "standard", content: "one voice" })], KIND_CTX, KIND_NAMES, null),
        appendUserTurn: null,
        namesBehavior: "content",
      }),
    );
    expect(out.history.find((r) => r.role === "assistant")?.content).toBe("Group: one voice");
  });
});

// The new-chat marker (ST `new_chat_prompt`) is the conversation's opening USER row, delivered bare at the top of
// the history — so a greeting-first chat opens on a user row on every route (owner ruling). It is not an operator
// note, so it takes no note frame.
describe("shape — the new-chat marker opens the history as a bare user row", () => {
  const marker = inChat({ depth: BEFORE_HISTORY_DEPTH, role: "user", content: "[Start a new chat]", origin: "new-chat-marker" });

  test("greeting-first send: the marker, then the greeting, then the sent turn", () => {
    const canon = [
      { role: "assistant" as const, content: "greeting", authorName: "Aria", characterId: ARIA },
      { role: "user" as const, content: "hello", authorName: "User" },
    ];
    const out = shape(soloInput({ canon, appendUserTurn: null, injections: [marker] }));
    expect(out.history).toEqual([
      { role: "user", content: "[Start a new chat]" },
      { role: "assistant", content: "greeting" },
      { role: "user", content: "hello" },
    ]);
  });

  test("no greeting: the marker joins the first user turn", () => {
    const out = shape(soloInput({ canon: [], appendUserTurn: "hello", injections: [marker] }));
    expect(out.history).toEqual([{ role: "user", content: "[Start a new chat]\n\nhello" }]);
  });

  // A depth-4 note on a 3-row chat clamps to the top, the same clamped depth as the marker. The marker listed
  // after it used to splice below it, so the note became the first row and no breakpoint was placed.
  test("an over-deep note that clamps to the top still lands below the marker, whatever the list order", () => {
    const note = inChat({ depth: 4, role: "system", content: "NOTE" });
    const slotted = { midConversationSystem: true, historySystemRows: true, roleHandlingFloor: "slotted" as const };
    for (const injections of [
      [note, marker],
      [marker, note],
      [{ ...note, order: 50 }, marker],
    ]) {
      const out = shape(soloInput({ injections, ...slotted }));
      expect(out.history[0]).toEqual({ role: "user", content: "[Start a new chat]" });
      expect(out.breakpointDecision).toBe("placed");
      expect(pinnedRow(out)?.content).toBe("[Start a new chat]");
    }
  });

  test("the output names the marker it placed, for the placement after the window fit", () => {
    expect(shape(soloInput({ injections: [marker] })).newChatMarker).toEqual({ content: "[Start a new chat]", mergeSeparator: "\n\n" });
    expect(shape(soloInput({ injections: [marker], roleHandlingFloor: "none" })).newChatMarker).toEqual({
      content: "[Start a new chat]",
      mergeSeparator: null,
    });
    expect(shape(soloInput()).newChatMarker).toBeNull();
  });
});

// ── CUED ROUNDS pin the last canon row before the cue (owner ruling) ───────────────────────────────────────
// A group round cue, a narrator cue and the continuation cue used to make every such round a "second volatile
// tail" with no history breakpoint at all, so group and narrator rooms billed the whole history every round
// (SHAPING-MATRIX §8 defect 3). The canon before SHAPE's own cue is committed, so the cue is the only volatile
// row.
describe("shape — a cued round pins the last canon row before the cue", () => {
  const roundCanon = [
    { role: "assistant" as const, content: "g", authorName: "Aria", characterId: ARIA },
    { role: "user" as const, content: "u1", authorName: "User" },
    { role: "assistant" as const, content: "a1", authorName: "Aria", characterId: ARIA },
  ];

  test("a group round cue", () => {
    const out = shape(soloInput({ canon: roundCanon, appendUserTurn: null, groupNudge: "[Write the next reply only as Kai.]" }));
    expect(out.history.at(-1)).toEqual({ role: "user", content: "[Write the next reply only as Kai.]" });
    expect(out.breakpointDecision).toBe("placed");
    expect(pinnedRow(out)?.content).toBe("a1");
  });

  test("a narrator cue", () => {
    const out = shape(soloInput({ canon: roundCanon, appendUserTurn: null, output: "narrator", groupNudge: "[Continue the scene.]" }));
    expect(pinnedRow(out)?.content).toBe("a1");
  });

  test("the continuation cue on a forced turn", () => {
    const out = shape(soloInput({ canon: roundCanon, appendUserTurn: null }));
    expect(out.history.at(-1)).toEqual({ role: "user", content: "[Continue the conversation.]" });
    expect(pinnedRow(out)?.content).toBe("a1");
  });

  test("the second speaker of a round pins the first speaker's committed reply", () => {
    const afterFirst = [
      ...roundCanon,
      { role: "user" as const, content: "u2", authorName: "User" },
      { role: "assistant" as const, content: "first", authorName: "Kai", characterId: KAI },
    ];
    const out = shape(soloInput({ canon: afterFirst, appendUserTurn: null, groupNudge: "[Write the next reply only as Aria.]" }));
    expect(pinnedRow(out)?.content).toBe("Kai: first");
  });

  test("the first speaker of a round: the sent turn merges with the cue, so the pin is the reply before it", () => {
    const sent = [...roundCanon, { role: "user" as const, content: "u2", authorName: "User" }];
    const out = shape(soloInput({ canon: sent, appendUserTurn: null, groupNudge: "[Write the next reply only as Kai.]" }));
    expect(out.history.at(-1)?.content).toBe("u2\n\n[Write the next reply only as Kai.]");
    expect(pinnedRow(out)?.content).toBe("a1");
  });
});

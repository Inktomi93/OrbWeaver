// SHAPE shaper: applyNamesBehavior (the chat design doc Part II §3 rule 5 — the trusted out-of-band Name: label).
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { describe } from "vitest";
import { applyNamesBehavior } from "../../../../../packages/server/src/domain/chat/assembly/names.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const SPEAKERS = { user: "User", assistant: "Aria" };

describe("applyNamesBehavior", () => {
  test('"none" strips names + drops authorName/name fields', () => {
    expect(applyNamesBehavior([{ role: "user", content: "u1", authorName: "OldPersona" }], "none", SPEAKERS)).toEqual([{ role: "user", content: "u1" }]);
  });

  test('"default" solo prefixes nothing → byte-identical (Part III §12 inv 1)', () => {
    const h = [
      { role: "assistant" as const, content: "greeting", authorName: "Aria" },
      { role: "user" as const, content: "u1", authorName: "User" },
    ];
    expect(applyNamesBehavior(h, "default", SPEAKERS, { multiCharacter: false })).toEqual([
      { role: "assistant", content: "greeting" },
      { role: "user", content: "u1" },
    ]);
  });

  test('"default" prefixes a user turn authored under a since-switched persona', () => {
    expect(applyNamesBehavior([{ role: "user", content: "hi", authorName: "Alt" }], "default", SPEAKERS, { multiCharacter: false })).toEqual([
      { role: "user", content: "Alt: hi" },
    ]);
  });

  test('"default" + multiCharacter prefixes assistant rows with their character name', () => {
    expect(
      applyNamesBehavior(
        [
          { role: "assistant", content: "greeting", authorName: "Aria" },
          { role: "assistant", content: "line", authorName: "Kai" },
        ],
        "default",
        SPEAKERS,
        { multiCharacter: true },
      ),
    ).toEqual([
      { role: "assistant", content: "Aria: greeting" },
      { role: "assistant", content: "Kai: line" },
    ]);
  });

  test('"default" + multiCharacter does NOT prefix an unattributed assistant row', () => {
    expect(applyNamesBehavior([{ role: "assistant", content: "x", authorName: null }], "default", SPEAKERS, { multiCharacter: true })).toEqual([
      { role: "assistant", content: "x" },
    ]);
  });

  test('"content" always prefixes author (falling back to the active speaker)', () => {
    expect(
      applyNamesBehavior(
        [
          { role: "user", content: "u1" },
          { role: "assistant", content: "a1", authorName: "Kai" },
        ],
        "content",
        SPEAKERS,
      ),
    ).toEqual([
      { role: "user", content: "User: u1" },
      { role: "assistant", content: "Kai: a1" },
    ]);
  });

  test('"completion" sets the OpenAI-spec name field when nothing downstream has to merge', () => {
    // `mergesAdjacent: false` — a backend that tolerates adjacent same-role rows. The out-of-band field is
    // the better shape there: the speaker never enters the content bytes.
    expect(applyNamesBehavior([{ role: "user", content: "u1", authorName: "Alt" }], "completion", SPEAKERS, { mergesAdjacent: false })).toEqual([
      { role: "user", content: "u1", name: "Alt" },
    ]);
  });

  test('"completion" INLINES the speaker when the strategy merges (ST pass 1: fold the name, then delete it)', () => {
    // The default — the unset `roleHandlingFloor` clamps to `strict`, so this is what ships. A surviving
    // `name` field would block `squashSameRole` and hand a strict provider the adjacent same-role pair it
    // rejects; it also let a demoted instruction inherit the player's name after a merge. ST folds the name
    // into content and deletes it before squashing for exactly this reason.
    expect(applyNamesBehavior([{ role: "user", content: "u1", authorName: "Alt" }], "completion", SPEAKERS)).toEqual([
      { role: "user", content: "Alt: u1", messageId: undefined },
    ]);
  });
});

// D129: WHETHER a canon row may be labelled is its declared KIND's answer; the mode only decides HOW.
// Three planes reach the same guard — a real `system` row, a demoted (`speakerless`) injection, and now the
// row's own purpose — and the kind arm is the only one that can see a CANON row.
describe("applyNamesBehavior — the label policy is the row's declared KIND", () => {
  const narratorBody = "Kai: hi.\nThe lamp gutters.";
  const narrator = [{ role: "assistant" as const, content: narratorBody, authorName: "Group", kind: "narrator" as const }];

  test("a narrator row is never labelled, in any mode — its body carries its own speakers", () => {
    for (const mode of ["content", "completion", "default"] as const) {
      expect(applyNamesBehavior(narrator, mode, SPEAKERS, { multiCharacter: true })).toEqual([{ role: "assistant", content: narratorBody }]);
    }
  });

  test("the SAME row declared standard takes the label — the dispatch narrows by purpose, not by content", () => {
    const standard = [{ ...narrator[0], role: "assistant" as const, content: "one voice", kind: "standard" as const, authorName: "Group" }];
    expect(applyNamesBehavior(standard, "content", SPEAKERS, { multiCharacter: true })).toEqual([{ role: "assistant", content: "Group: one voice" }]);
  });

  test("a row with NO declared kind (a synthetic turn SHAPE built) takes the standard answer", () => {
    expect(applyNamesBehavior([{ role: "user", content: "u1", authorName: "Alt" }], "content", SPEAKERS)).toEqual([{ role: "user", content: "Alt: u1" }]);
  });
});

describe("applyNamesBehavior — system rows are the operator channel, never labeled", () => {
  const h = [{ role: "system" as const, content: "GM note" }];
  test("every mode passes a system row through untouched (no prefix, no completion name)", () => {
    expect(applyNamesBehavior(h, "content", SPEAKERS)).toEqual([{ role: "system", content: "GM note" }]);
    expect(applyNamesBehavior(h, "completion", SPEAKERS)).toEqual([{ role: "system", content: "GM note" }]);
    expect(applyNamesBehavior(h, "none", SPEAKERS)).toEqual([{ role: "system", content: "GM note" }]);
    expect(applyNamesBehavior(h, "default", SPEAKERS)).toEqual([{ role: "system", content: "GM note" }]);
  });
});

// The multi-human rule: the active persona is one human's, so in a room of several humans a label that depends
// on "is this row the active persona's?" flips whenever a different human is active. Every canon user row is
// labelled instead, so no row's bytes depend on who pressed send.
describe("applyNamesBehavior — a multi-human room labels every canon user row", () => {
  const alice = { role: "user" as const, content: "hi", authorName: "Alice", messageId: mintTypeId(ID_PREFIX.message) };
  const bob = { role: "user" as const, content: "yo", authorName: "Bob", messageId: mintTypeId(ID_PREFIX.message) };

  test('"default" labels the active persona\'s own row too, so the bytes are the same whoever is active', () => {
    const asAlice = applyNamesBehavior([alice, bob], "default", { user: "Alice", assistant: "Aria" }, { multiHuman: true });
    const asBob = applyNamesBehavior([alice, bob], "default", { user: "Bob", assistant: "Aria" }, { multiHuman: true });
    expect(asAlice.map((r) => r.content)).toEqual(["Alice: hi", "Bob: yo"]);
    expect(asBob).toEqual(asAlice);
  });

  test('"default" in a solo room keeps the active persona\'s own row unlabelled (byte-identical)', () => {
    expect(applyNamesBehavior([alice], "default", { user: "Alice", assistant: "Aria" }, { multiHuman: false }).map((r) => r.content)).toEqual(["hi"]);
  });

  test("a synthetic user row (no messageId) is not labelled — it has no author to name", () => {
    const nudge = { role: "user" as const, content: "[Continue]" };
    expect(applyNamesBehavior([nudge], "default", { user: "Alice", assistant: "Aria" }, { multiHuman: true })).toEqual([
      { role: "user", content: "[Continue]" },
    ]);
  });
});

// Owner ruling: "none" leaves a room of several humans or characters unreadable, so there it runs as "default".
describe('applyNamesBehavior — "none" runs as "default" in a room with more than one human or character', () => {
  const alice = { role: "user" as const, content: "hi", authorName: "Alice", messageId: mintTypeId(ID_PREFIX.message) };
  const kai = { role: "assistant" as const, content: "hey", authorName: "Kai", messageId: mintTypeId(ID_PREFIX.message) };
  const speakers = { user: "Alice", assistant: "Kai" };

  test("two humans: user rows are labelled", () => {
    expect(applyNamesBehavior([alice, kai], "none", speakers, { multiHuman: true }).map((r) => r.content)).toEqual(["Alice: hi", "hey"]);
  });

  test("two characters: per-speaker assistant rows are labelled", () => {
    expect(applyNamesBehavior([alice, kai], "none", speakers, { multiCharacter: true }).map((r) => r.content)).toEqual(["hi", "Kai: hey"]);
  });

  test("a narrator row keeps its own attribution and takes no row label", () => {
    const narrator = { role: "assistant" as const, content: "Kai: hey.\nMara: hi.", authorName: "Group", kind: "narrator" as const };
    expect(applyNamesBehavior([alice, narrator], "none", speakers, { multiHuman: true }).map((r) => r.content)).toEqual(["Alice: hi", "Kai: hey.\nMara: hi."]);
  });

  test("a solo room keeps a true none, byte-identical", () => {
    expect(applyNamesBehavior([alice, kai], "none", speakers)).toEqual([
      { role: "user", content: "hi", messageId: alice.messageId },
      { role: "assistant", content: "hey", messageId: kai.messageId },
    ]);
  });
});

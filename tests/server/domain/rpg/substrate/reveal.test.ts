// tests/server/domain/rpg/substrate/reveal — the PURE host-reveal derivation (parity-plus §3.6). Over
// hand-built assistant bodies: the per-message parsed hidden spans (registry field order) + the standing-lie
// inventory (grouped by character, most-recent-wins per truth). The SAME kit tokenizer + HIDDEN_TAGS registry
// the member-strip reads, so the reveal shows exactly what was stripped.

import type { MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { RevealBodyRow } from "../../../../../packages/server/src/domain/rpg/contract/service";
import { buildRevealView } from "../../../../../packages/server/src/domain/rpg/substrate/reveal";
import { expect, test } from "../../../../support/fixtures";

const LIE = (character: string, truth: string): string => `<lie character="${character}" type="motive" truth="${truth}" reason="greed" />`;
const OFILTER = '<ofilter event="a spy watches from the roof" reason="the player is indoors" />';

function body(messageId: MessageId, seq: number, content: string): RevealBodyRow {
  return { messageId: castId<MessageId>(messageId), seq, content };
}

test("a body with no hidden spans yields no reveal message; an empty transcript reveals nothing", () => {
  expect(buildRevealView([])).toEqual({ messages: [], standingLies: [] });
  const clean = buildRevealView([body(castId<MessageId>("m1"), 1, "just prose, a :::card\n<p>x</p>\n::: and text")]);
  expect(clean.messages).toEqual([]);
  expect(clean.standingLies).toEqual([]);
});

test("a lie span is parsed into its registry fields (character/type/truth/reason), in order", () => {
  const view = buildRevealView([body(castId<MessageId>("m1"), 1, `Mari smiles. ${LIE("Mari", "she wants the gold")}`)]);
  expect(view.messages).toHaveLength(1);
  const span = view.messages[0]?.spans[0];
  expect(span?.tag).toBe("lie");
  expect(span?.revealLabel).toBe("Deception");
  expect(span?.fields).toEqual([
    { key: "character", value: "Mari" },
    { key: "type", value: "motive" },
    { key: "truth", value: "she wants the gold" },
    { key: "reason", value: "greed" },
  ]);
});

test("an ofilter span reveals event/reason and is EXCLUDED from the standing-lie inventory", () => {
  const view = buildRevealView([body(castId<MessageId>("m1"), 1, `The room is quiet. ${OFILTER}`)]);
  expect(view.messages[0]?.spans[0]?.tag).toBe("ofilter");
  expect(view.messages[0]?.spans[0]?.revealLabel).toBe("Unperceived");
  // ofilter is a perception gate, not a standing deception — the inventory ignores it.
  expect(view.standingLies).toEqual([]);
});

test("the standing-lie inventory groups by character, most-recent-wins per (character, truth)", () => {
  // Mari lies about the same truth twice (later message wins the anchor) + a second distinct lie; Zandik lies once.
  const view = buildRevealView([
    body(castId<MessageId>("m1"), 1, LIE("Mari", "she wants the gold")),
    body(castId<MessageId>("m2"), 2, LIE("Zandik", "he is unarmed")),
    body(castId<MessageId>("m3"), 3, `${LIE("Mari", "she wants the gold")} ${LIE("Mari", "she is a spy")}`),
  ]);
  const mari = view.standingLies.find((g) => g.character === "Mari");
  const zandik = view.standingLies.find((g) => g.character === "Zandik");
  expect(mari?.lies).toHaveLength(2); // two distinct truths
  // most-recent-wins: the "gold" lie's anchor is the LATER message m3, not m1.
  expect(mari?.lies.find((l) => l.truth === "she wants the gold")?.messageId).toBe("m3");
  expect(mari?.lies.find((l) => l.truth === "she is a spy")?.messageId).toBe("m3");
  expect(zandik?.lies).toHaveLength(1);
  expect(zandik?.lies[0]?.messageId).toBe("m2");
});

test("only messages WITH hidden spans appear in `messages`; the inventory reads across all", () => {
  const view = buildRevealView([
    body(castId<MessageId>("m1"), 1, "plain prose"),
    body(castId<MessageId>("m2"), 2, LIE("Mari", "the door is locked")),
    body(castId<MessageId>("m3"), 3, "more plain prose"),
  ]);
  expect(view.messages.map((m) => m.messageId)).toEqual(["m2"]);
  expect(view.standingLies).toHaveLength(1);
});

test("a lie with an omitted attr projects an empty-string field (the model left it out)", () => {
  const view = buildRevealView([body(castId<MessageId>("m1"), 1, '<lie character="Mari" truth="she lies" />')]);
  const fields = view.messages[0]?.spans[0]?.fields ?? [];
  expect(fields.find((f) => f.key === "type")?.value).toBe("");
  expect(fields.find((f) => f.key === "reason")?.value).toBe("");
  expect(fields.find((f) => f.key === "truth")?.value).toBe("she lies");
});

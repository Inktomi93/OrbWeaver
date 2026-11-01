// A picture in a turn's prose takes the last sentence in front of it as its alt, and a long run in that prose costs
// its length. The alt is permanent canon, so it is read back off the committed body.
// @subject packages/server/src/domain/chat/substrate/inline-reply-images.ts

import { tokenizeContent } from "@orb/kit/content";
import { expect, test } from "@orb/testkit/node";
import { imageRoom, nativeImage, nativeText } from "../engine/inline-image-physical.ts";

const HIDDEN_TRUTH = "the-sealed-truth";
const RUN = 240_000;
const TURN_BUDGET_MS = 8000;

const ALT_ROWS = [
  ["the text after the last terminator", "One. Two! The map", "The map"],
  ["a closing quote stays with its sentence", 'She said "go." He ran', "He ran"],
  ["a closing bracket stays with its sentence", "(Go.) [Now!] He ran", "He ran"],
  ["a terminator run is one sentence end", "Wait...?! what", "what"],
  ["an ellipsis and a curly closer", "Wait…’ then", "then"],
  ["any whitespace ends a sentence", "One.\nTwo", "Two"],
  ["a terminator with no space after it is not an end", "v1.2 ships", "v1.2 ships"],
  ["a closer with no space after it is not an end", 'He said "go."then left', 'He said "go."then left'],
  ["a reply that ends on its terminator keeps that sentence", "One. Two.", "Two."],
  ["prose with no terminator is the whole caption", "A map on the table", "A map on the table"],
  ["a closed hidden span never reaches the alt", `Seen. <lie truth="${HIDDEN_TRUTH}"/> Tail`, "Tail"],
] as const;

function altOf(body: string | undefined): string {
  const image = tokenizeContent(body ?? "", { committed: true }).find((span) => span.kind === "image");
  if (image?.kind !== "image") {
    throw new Error("the turn committed no picture span");
  }
  return image.alt;
}

test("each committed alt is the last sentence in front of its picture", async () => {
  const [first, ...rest] = ALT_ROWS;
  await using fixture = await imageRoom([[nativeText(first[1]), nativeImage()]]);
  expect(altOf((await fixture.turn()).messages[0]?.content), first[0]).toBe(first[2]);
  for (const [name, prose, alt] of rest) {
    const chat = await fixture.openChat([[nativeText(prose), nativeImage()]]);
    expect(altOf((await chat.turn()).messages[0]?.content), name).toBe(alt);
  }
});

test("a picture that opens the turn has an empty alt", async () => {
  await using fixture = await imageRoom([[nativeImage(), nativeText("After.")]]);
  expect(altOf((await fixture.turn()).messages[0]?.content)).toBe("");
});

test("a long terminator run with no sentence end costs its length through a real turn", async () => {
  const prose = `Scene ${".".repeat(RUN)}x`;
  await using fixture = await imageRoom([[nativeText(prose), nativeImage()]]);
  const started = performance.now();
  const outcome = await fixture.turn();
  const elapsed = performance.now() - started;
  expect(outcome.aborted).toBe(false);
  expect(altOf(outcome.messages[0]?.content)).toMatch(/^Scene \.+$/u);
  expect(elapsed).toBeLessThan(TURN_BUDGET_MS);
});

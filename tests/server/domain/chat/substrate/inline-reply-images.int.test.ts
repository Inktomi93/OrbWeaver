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

const SEALED = [
  ["a quoted fence line, picture after the tag", [nativeText(`Scene. <lie truth="A. ${HIDDEN_TRUTH}\n\`\`\`\nmore"/> after`), nativeImage()], "after"],
  ["a quoted directive close, picture after the tag", [nativeText(`:::card\n<lie truth="x\n:::\n${HIDDEN_TRUTH}"/> tail\n:::\nend`), nativeImage()], "end"],
  ["the picture lands in the tag name", [nativeText("Hi <li"), nativeImage(), nativeText(`e truth="${HIDDEN_TRUTH}"/> after`)], "after"],
  ["the picture lands in the attr name", [nativeText("Hi <lie tr"), nativeImage(), nativeText(`uth="${HIDDEN_TRUTH}"/> after`)], "after"],
  ["the picture lands just past the open", [nativeText("Hi <"), nativeImage(), nativeText(`lie truth="${HIDDEN_TRUTH}"/> after`)], "after"],
  [
    "the picture lands in the quoted value",
    [nativeText(`Hi <lie truth="${HIDDEN_TRUTH.slice(0, 3)}`), nativeImage(), nativeText(`${HIDDEN_TRUTH.slice(3)}"/> after`)],
    "after",
  ],
  ["a splice would lift mid-line ticks into a fence", [nativeText("Hi"), nativeImage(), nativeText(`\`\`\`<lie truth="${HIDDEN_TRUTH}"/> after`)], "after"],
  ["an alt would carry a fence line", [nativeText("```\nx. y\n```\nz"), nativeImage(), nativeText(`<lie truth="${HIDDEN_TRUTH}"/> after`)], "after"],
  ["a splice would split a fence opener", [nativeText("``"), nativeImage(), nativeText(`\`\`\ncode\n\`\`\`\n<lie truth="${HIDDEN_TRUTH}"/> after`)], "after"],
  [
    "two pictures land in one tag",
    [nativeText("Hi <lie tr"), nativeImage(), nativeText("ut"), nativeImage(), nativeText(`h="${HIDDEN_TRUTH}"/> after`)],
    "after",
  ],
] as const;

test.each([
  ["a hidden tag", [nativeText("Hi. "), nativeImage(), nativeText(`<lie truth="${HIDDEN_TRUTH}"/> after`)], "<lie"],
  ["a fence on its own line", [nativeText("Hi.\n"), nativeImage(), nativeText("```\ncode\n```")], "```"],
  ["a fence that opens the reply", [nativeImage(), nativeText("```\ncode\n```")], "```"],
] as const)("a picture that arrives just ahead of %s stays ahead of it", async (_name, parts, follower) => {
  await using fixture = await imageRoom([parts]);
  const body = (await fixture.turn()).messages[0]?.content ?? "";
  expect(body.indexOf("![")).toBeGreaterThan(-1);
  expect(body.indexOf("![")).toBeLessThan(body.indexOf(follower));
});

test.each(SEALED)("a member never reads the sealed bytes: %s", async (_name, parts, witness) => {
  const pictures = parts.filter((part) => JSON.stringify(part).includes("inlineData")).length;
  await using fixture = await imageRoom([parts]);
  const { h } = fixture;
  const invite = async (): Promise<Awaited<ReturnType<typeof h.root.principalFor>>> => {
    const member = await h.root.principalFor((await h.root.actor()).id);
    const invitation = await h.root.services.chat.createInvite({ principal: h.owner, chatId: h.chatId, input: { invitedHandle: member.handle } });
    await h.root.services.chat.acceptInvite({ principal: member, inviteId: invitation.invite.id });
    return member;
  };
  const present = await invite();
  expect((await fixture.turn()).aborted).toBe(false);
  const lateJoiner = await invite();

  const host = await h.root.services.chat.listMessages({ principal: h.owner, chatId: h.chatId });
  expect(JSON.stringify(host.messages)).toContain(HIDDEN_TRUTH);
  for (const member of [present, lateJoiner]) {
    const read = await h.root.services.chat.listMessages({ principal: member, chatId: h.chatId });
    const body = read.messages.at(-1)?.content ?? "";
    expect(body).toContain(witness);
    expect(tokenizeContent(body, { committed: true }).filter((span) => span.kind === "image")).toHaveLength(pictures);
    expect(JSON.stringify(read.messages)).not.toContain(HIDDEN_TRUTH);
    const replay = await h.root.services.chat.replayChatEvents({ principal: member, chatId: h.chatId });
    expect(JSON.stringify(replay)).toContain(witness);
    expect(JSON.stringify(replay)).not.toContain(HIDDEN_TRUTH);
  }
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

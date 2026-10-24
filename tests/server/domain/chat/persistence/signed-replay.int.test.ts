// A continued Google reply stores its content signatures on the variant metadata, and a later send leaves
// the stored variant row byte-for-byte unchanged.
// @subject packages/server/src/domain/chat/verbs/turn.ts
// @subject packages/server/src/domain/chat/substrate/wire-history.ts

import { messageVariants } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { eq } from "drizzle-orm";
import { imageRoom, nativeText, wireParts } from "../engine/inline-image-physical.ts";
import { inlineImageRows } from "./inline-image-rows.ts";

const PREFIX = "The secret word is";
const SUFFIX = " ORBIT.";
const PREFIX_PROOF = "tail-private-prefix-proof";
const SUFFIX_PROOF = "tail-private-suffix-proof";
const EDITED = `Edited: ${PREFIX}${SUFFIX}`;

test("actual native signed parts replay in order through continuation and restore, but never follow an edited body or public events", async () => {
  await using image = await imageRoom([
    [nativeText(PREFIX, PREFIX_PROOF)],
    [nativeText(SUFFIX, SUFFIX_PROOF)],
    [nativeText("Probe combined.")],
    [nativeText("Probe undone.")],
    [nativeText("Probe reverted.")],
    [nativeText("Probe edited.")],
  ]);
  const { h } = image;
  const params = { principal: h.owner, chatId: h.chatId };
  const initial = await h.root.services.chat.generate(params);
  expect(initial.aborted).toBe(false);
  const target = initial.messages[0];
  if (target === undefined) {
    throw new Error("the actual signed generation did not select a target");
  }
  expect(target.content).toBe(PREFIX);
  const targetParams = { ...params, messageId: target.id };
  const probe = async (): Promise<void> => {
    const before = await h.root.db.select().from(messageVariants).where(eq(messageVariants.id, target.selectedVariantId)).get();
    // A real user boundary preserves signed model parts instead of merging adjacent model messages on Google's wire.
    const outcome = await h.root.services.chat.send({ ...params, content: "Inspect the current account." });
    expect(outcome.aborted).toBe(false);
    expect(outcome.messages.every(({ id }) => id !== target.id)).toBe(true);
    expect(await h.root.db.select().from(messageVariants).where(eq(messageVariants.id, target.selectedVariantId)).get()).toEqual(before);
  };
  const continued = await h.root.services.chat.continueTurn(targetParams);
  expect(continued.aborted).toBe(false);
  expect(continued.messages).toMatchObject([{ id: target.id, content: `${PREFIX}${SUFFIX}` }]);
  expect(
    (await h.root.db.select().from(messageVariants).where(eq(messageVariants.id, target.selectedVariantId)).get())?.metadata?.contentSignatures?.text,
  ).toEqual([
    { text: PREFIX, thoughtSignature: PREFIX_PROOF },
    { text: SUFFIX, thoughtSignature: SUFFIX_PROOF },
  ]);
  await probe();
  expect(wireParts((await image.inputs())[2] ?? [], "model").slice(0, 2)).toEqual([nativeText(PREFIX, PREFIX_PROOF), nativeText(SUFFIX, SUFFIX_PROOF)]);

  expect((await h.root.services.chat.undoContinue(targetParams)).content).toBe(PREFIX);
  await probe();
  const undone = wireParts((await image.inputs())[3] ?? [], "model");
  expect(undone[0]).toEqual(nativeText(PREFIX, PREFIX_PROOF));
  expect(JSON.stringify(undone)).not.toContain(SUFFIX_PROOF);

  expect((await h.root.services.chat.revertContinue(targetParams)).content).toBe(`${PREFIX}${SUFFIX}`);
  await probe();
  expect(wireParts((await image.inputs())[4] ?? [], "model").slice(0, 2)).toEqual([nativeText(PREFIX, PREFIX_PROOF), nativeText(SUFFIX, SUFFIX_PROOF)]);

  expect((await h.root.services.chat.editMessage({ ...targetParams, content: EDITED })).content).toBe(EDITED);
  await probe();
  const inputs = await image.inputs();
  expect(inputs).toHaveLength(6);
  const edited = wireParts(inputs[5] ?? [], "model");
  expect(edited[0]).toEqual(nativeText(EDITED));
  expect(JSON.stringify(edited)).not.toContain(PREFIX_PROOF);
  expect(JSON.stringify(edited)).not.toContain(SUFFIX_PROOF);
  expect(JSON.stringify(await inlineImageRows(image.h).events())).not.toContain(PREFIX_PROOF);
  expect(JSON.stringify(await inlineImageRows(image.h).events())).not.toContain(SUFFIX_PROOF);
});

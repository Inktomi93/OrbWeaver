// Native image and tool bytes land as generated CAS assets with message_assets retaining links, the selected
// variant row keeps their private signatures, and no stored chat_events payload carries one.
// @subject packages/server/src/domain/chat/engine/engine.ts

import { ID_PREFIX } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import { makeAssetBytes, seedAsset } from "@orb/testkit/node/composed";
import {
  AFTER_SIGNATURE,
  BEFORE_SIGNATURE,
  IMAGE_PROSE,
  IMAGE_SIGNATURE,
  IMAGE_TOOL,
  imageRoom,
  nativeImage,
  nativeText,
  nativeTool,
  partKinds,
  TEXT_SIGNATURE,
  TOOL_SIGNATURE,
  wireParts,
} from "../engine/inline-image-physical.ts";
import { inlineImageRows } from "./inline-image-rows.ts";

test("the native picture lands in exact canon with a minted alt and an inline-reply retaining link", async () => {
  await using fixture = await imageRoom([[nativeText(IMAGE_PROSE), nativeImage()]]);
  const outcome = await fixture.turn();
  expect(outcome.aborted).toBe(false);
  const generated = await inlineImageRows(fixture.h).generated();
  expect(generated).toHaveLength(1);
  expect(generated[0]).toMatchObject({ ownerId: fixture.h.owner.userId, kind: "generated", mime: "image/png", width: 8, height: 8 });
  expect(outcome.messages).toHaveLength(1);
  expect(outcome.messages[0]?.content).toBe(`${IMAGE_PROSE}\n\n![${IMAGE_PROSE}](asset:${generated[0]?.id})`);
  expect((await inlineImageRows(fixture.h).links()).map(({ assetId, origin, messageId }) => ({ assetId, origin, messageId }))).toEqual([
    { assetId: generated[0]?.id, origin: "inline-reply", messageId: outcome.messages[0]?.id },
  ]);
});

test("the next actual native request carries its prior picture on model, never user content", async () => {
  const image = nativeImage();
  await using fixture = await imageRoom([[nativeText(IMAGE_PROSE), image], [nativeText("Explain.")]]);
  expect((await fixture.turn()).aborted).toBe(false);
  expect((await fixture.turn()).aborted).toBe(false);
  const inputs = await fixture.inputs();
  expect(inputs).toHaveLength(2);
  expect(wireParts(inputs[1] ?? [], "model")).toContainEqual(expect.objectContaining({ inlineData: expect.objectContaining({ mimeType: "image/png" }) }));
  expect(JSON.stringify(wireParts(inputs[1] ?? [], "user"))).not.toContain("inlineData");
  expect(await inlineImageRows(fixture.h).generated()).toHaveLength(1);
});

test("native image and text signatures stay private and replay only with their selected asset and text", async () => {
  await using fixture = await imageRoom([[nativeText(IMAGE_PROSE, TEXT_SIGNATURE), nativeImage()], [nativeText("Explain.")]]);
  expect((await fixture.turn()).aborted).toBe(false);
  const image = (await inlineImageRows(fixture.h).generated())[0];
  expect(image).toBeDefined();
  expect((await inlineImageRows(fixture.h).selected())?.contentSignatures).toMatchObject({
    images: [{ assetId: image?.id, thoughtSignature: IMAGE_SIGNATURE }],
    text: [{ text: IMAGE_PROSE, thoughtSignature: TEXT_SIGNATURE }],
  });
  expect(JSON.stringify(await fixture.canon())).not.toContain("private-native-");
  expect(JSON.stringify(await inlineImageRows(fixture.h).events())).not.toContain("private-native-");
  expect((await fixture.turn()).aborted).toBe(false);
  const parts = wireParts((await fixture.inputs())[1] ?? [], "model");
  expect(parts).toContainEqual(expect.objectContaining({ inlineData: expect.any(Object), thoughtSignature: IMAGE_SIGNATURE }));
  expect(parts).toContainEqual({ text: IMAGE_PROSE, thoughtSignature: TEXT_SIGNATURE });
  expect(parts.filter((part) => JSON.stringify(part).includes(IMAGE_SIGNATURE))).toHaveLength(1);
  expect(parts.filter((part) => JSON.stringify(part).includes(TEXT_SIGNATURE))).toHaveLength(1);
});

test("the real narrator illustration writer in the same room cannot launder its stored image into model media", async () => {
  await using fixture = await imageRoom([[nativeText("A quiet beat.")]]);
  const stored = await seedAsset(fixture.h.root, {
    principal: fixture.h.owner,
    bytes: makeAssetBytes(fixture.h.root.idSource.typeId(ID_PREFIX.asset)),
    kind: "generated",
    mime: "image/png",
    enforceMagic: true,
  });
  const post = await fixture.h.root.app.chatRpgOps.postNarratorMessage(fixture.h.chatId, "", [stored.row.id]);
  expect((await inlineImageRows(fixture.h).links()).map(({ messageId, assetId, origin }) => ({ messageId, assetId, origin }))).toEqual([
    { messageId: post.messageId, assetId: stored.row.id, origin: "illustration" },
  ]);
  const canon = await fixture.canon();
  expect(canon.messages).toMatchObject([{ role: "assistant", content: `![illustration](asset:${stored.row.id})` }]);
  expect((await fixture.turn()).aborted).toBe(false);
  const input = (await fixture.inputs())[0] ?? [];
  expect(JSON.stringify(input)).not.toContain("inlineData");
  expect(JSON.stringify(input)).not.toContain(stored.row.id);
});

test("invalid physical PNG bytes lose only the picture: prose commits without an orphan span/link and warns", async () => {
  await using fixture = await imageRoom([[nativeText(IMAGE_PROSE), nativeImage(true)]]);
  const outcome = await fixture.turn();
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages).toMatchObject([{ content: IMAGE_PROSE }]);
  expect(await inlineImageRows(fixture.h).links()).toEqual([]);
  expect(await inlineImageRows(fixture.h).generated()).toEqual([]);
  expect((await inlineImageRows(fixture.h).events()).filter(({ payload }) => payload.type === "warning" && payload.code === "reply_image_failed")).toHaveLength(
    1,
  );
});

test("text-only native output stays byte-identical and creates no image asset, span or retaining link", async () => {
  await using fixture = await imageRoom([[nativeText("Just words.")]]);
  const outcome = await fixture.turn();
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages).toMatchObject([{ content: "Just words." }]);
  expect(await inlineImageRows(fixture.h).generated()).toEqual([]);
  expect(await inlineImageRows(fixture.h).links()).toEqual([]);
});

for (const imageBeforeTool of [true, false]) {
  test(`two native completion legs preserve imageBeforeTool=${String(imageBeforeTool)} at an equal prose boundary`, async () => {
    const image = nativeImage();
    await using fixture = await imageRoom(
      [
        [nativeText("Before."), ...(imageBeforeTool ? [image] : []), nativeTool()],
        [...(imageBeforeTool ? [] : [image]), nativeText("After.")],
        [nativeText("Explain.")],
      ],
      true,
    );
    const outcome = await fixture.turn();
    expect(outcome.aborted).toBe(false);
    const stored = (await inlineImageRows(fixture.h).generated())[0];
    expect(await inlineImageRows(fixture.h).generated()).toHaveLength(1);
    expect(outcome.messages[0]?.content).toBe(`Before.\n\n![Before.](asset:${stored?.id})\n\nAfter.`);
    expect(outcome.messages[0]?.toolCalls).toMatchObject([{ name: IMAGE_TOOL, toolCallId: "same", result: "Moon", isError: false }]);
    expect((await inlineImageRows(fixture.h).selected())?.contentSignatures).toMatchObject({
      images: [{ assetId: stored?.id, thoughtSignature: IMAGE_SIGNATURE }],
      tools: [{ toolCallId: "same", thoughtSignature: TOOL_SIGNATURE }],
    });
    expect(JSON.stringify(await fixture.canon())).not.toContain("private-native-");
    expect((await fixture.turn()).aborted).toBe(false);
    const inputs = await fixture.inputs();
    expect(inputs).toHaveLength(3);
    const parts = wireParts(inputs[2] ?? []);
    expect(parts).toContainEqual({ text: imageBeforeTool ? "Before.\n\n" : "Before." });
    expect(parts).toContainEqual({ text: imageBeforeTool ? "After." : "\n\nAfter." });
    const orderParts = parts.map((part) =>
      part !== null && typeof part === "object" && !Array.isArray(part) && typeof part["text"] === "string" ? { ...part, text: part["text"].trim() } : part,
    );
    expect(partKinds(orderParts)).toEqual(
      imageBeforeTool ? ["Before.", "image", "call", "result", "After."] : ["Before.", "call", "result", "image", "After."],
    );
    expect(parts).toContainEqual(expect.objectContaining({ inlineData: expect.any(Object), thoughtSignature: IMAGE_SIGNATURE }));
    expect(parts).toContainEqual(
      expect.objectContaining({ functionCall: expect.objectContaining({ id: "same", name: IMAGE_TOOL }), thoughtSignature: TOOL_SIGNATURE }),
    );
  });

  test(`one native completion preserves imageBeforeTool=${String(imageBeforeTool)} through conversion, in-turn tools, commit and replay`, async () => {
    const image = nativeImage();
    const tool = nativeTool();
    await using fixture = await imageRoom(
      [
        [nativeText("Before.", BEFORE_SIGNATURE), ...(imageBeforeTool ? [image, tool] : [tool, image]), nativeText("After.", AFTER_SIGNATURE)],
        [nativeText("Done.")],
        [nativeText("Explain.")],
      ],
      true,
    );
    const outcome = await fixture.turn();
    expect(outcome.aborted).toBe(false);
    const stored = (await inlineImageRows(fixture.h).generated())[0];
    expect(await inlineImageRows(fixture.h).generated()).toHaveLength(1);
    expect(outcome.messages[0]?.content).toBe(`Before.\n\n![Before.](asset:${stored?.id})\n\nAfter.Done.`);
    expect(outcome.messages[0]?.toolCalls).toMatchObject([{ name: IMAGE_TOOL, toolCallId: "same", result: "Moon", isError: false }]);
    const inTurn = (await fixture.inputs())[1] ?? [];
    expect(partKinds(wireParts(inTurn, "model"))).toEqual(imageBeforeTool ? ["Before.", "image", "call", "After."] : ["Before.", "call", "image", "After."]);
    expect(JSON.stringify(await fixture.canon())).not.toContain("private-native-");
    expect((await fixture.turn()).aborted).toBe(false);
    const inputs = await fixture.inputs();
    expect(inputs).toHaveLength(3);
    const parts = wireParts(inputs[2] ?? [], "model");
    expect(partKinds(parts)).toEqual(imageBeforeTool ? ["Before.", "image", "call", "After.", "Done."] : ["Before.", "call", "image", "After.", "Done."]);
    expect(parts).toContainEqual({ text: "Before.", thoughtSignature: BEFORE_SIGNATURE });
    expect(parts).toContainEqual({ text: "After.", thoughtSignature: AFTER_SIGNATURE });
    expect(parts).toContainEqual(expect.objectContaining({ inlineData: expect.any(Object), thoughtSignature: IMAGE_SIGNATURE }));
    expect(parts).toContainEqual(
      expect.objectContaining({ functionCall: expect.objectContaining({ id: "same", name: IMAGE_TOOL }), thoughtSignature: TOOL_SIGNATURE }),
    );
    expect(JSON.stringify(await inlineImageRows(fixture.h).events())).not.toContain("private-native-");
  });
}

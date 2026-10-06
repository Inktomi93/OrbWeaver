import { imageryGenerations } from "@orb/db";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { readOwnedImageryCalls } from "../../../../../packages/server/src/domain/imagery/persistence/portability-read.ts";
import { seedAsset } from "../../../../support/factories/asset.ts";
import { seedCharacter } from "../../../../support/factories/character.ts";
import { makeImageryCall } from "../../../../support/factories/imagery-call.ts";
import { seedUser } from "../../../../support/factories/user.ts";
import { expect, test } from "../../../../support/fixtures.ts";

test("native execution grouping is asset-owner scoped and a foreign subject label cannot leak", async ({ db }) => {
  const owner = await seedUser(db);
  const other = await seedUser(db);
  const subject = await seedCharacter(db, { ownerId: other.id });
  const call = makeImageryCall();
  for (const [index, image] of call.images.entries()) {
    await seedAsset(db, { id: image.assetId, ownerId: index === 0 ? owner.id : other.id, kind: "generated" });
    await db.insert(imageryGenerations).values({
      id: mintTypeId(ID_PREFIX.imageryGeneration),
      assetId: image.assetId,
      callId: call.execution.sourceCallId,
      mode: call.execution.mode,
      model: call.execution.model,
      provider: call.execution.provider,
      prompt: call.execution.prompt,
      subjectCharacterId: subject.id,
      costUsd: 0,
      costProvenance: "measured",
      costDetails: { totalUsd: 0 },
      tokenDetails: { input: [{ modality: "text", tokens: 0 }] },
      tokensIn: 0,
      tokensOut: null,
      cacheReadTokens: null,
      cacheWriteTokens: null,
      servedModel: "served-native",
      createdAt: call.execution.createdAt,
    });
  }
  const owned = await readOwnedImageryCalls(db, owner.id, true);
  expect(owned).toHaveLength(1);
  expect(owned[0]?.images.map((image) => image.assetId)).toEqual([call.images[0]?.assetId]);
  expect(owned[0]?.execution).toMatchObject({
    subjectCharacterHandle: null,
    costUsd: 0,
    usage: { tokensIn: 0, tokensOut: null, cacheReadTokens: null, tokenDetails: { input: [{ modality: "text", tokens: 0 }] } },
  });
  expect(JSON.stringify(owned)).not.toContain(subject.handle);
  const foreign = await readOwnedImageryCalls(db, other.id);
  expect(foreign[0]?.images.map((image) => image.assetId)).toEqual([call.images[1]?.assetId]);
  expect(foreign[0]?.execution.subjectCharacterHandle).toBe(subject.handle);
});

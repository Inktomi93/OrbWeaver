// @subject packages/server/src/domain/persona/verbs/import.ts
// @subject packages/server/src/domain/persona/verbs/export.ts
// A persona backup names its avatar by content hash. The import resolves that hash only against the importing
// account's own picture assets, so an owner's own file finds the persona it came from (D290), and an account that
// holds no copy of the bytes gets the persona without art, which the same file then finds again.
import { createPersonaSchema } from "@orb/contracts/persona";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { magicBytes } from "@orb/testkit/node/helpers";

type Principal = Awaited<ReturnType<ServerTestHarness["principalFor"]>>;

async function personaFile(harness: ServerTestHarness, owner: Principal): Promise<{ readonly bytes: Uint8Array; readonly avatarHash: string | null }> {
  const picture = await harness.app.assets.store({ principal: owner, bytes: magicBytes("png"), kind: "avatar", mime: "image/png" });
  const persona = await harness.services.persona.create({
    principal: owner,
    input: createPersonaSchema.parse({ name: "Wanderer", description: "Walks the long road.", avatarAssetId: picture.assetId }),
  });
  const file = await harness.services.persona.export({ principal: owner, personaId: persona.id, note: () => undefined });
  return { bytes: file.bytes, avatarHash: persona.avatarHash };
}

test("an owner's own backup of a persona with an avatar reuses that persona and mints none", async ({ harness }) => {
  const owner = await harness.principalFor((await harness.actor()).id);
  const file = await personaFile(harness, owner);
  const before = await harness.services.persona.list({ principal: owner });

  const outcome = await harness.services.persona.import({ principal: owner, bytes: file.bytes });
  expect(outcome).toMatchObject({ ok: true, created: false, persona: { name: "Wanderer", avatarHash: file.avatarHash } });
  expect((await harness.services.persona.list({ principal: owner })).map((persona) => persona.id)).toEqual(before.map((persona) => persona.id));
});

test("an account without the avatar's bytes gets the persona without art, and the same file imported again is reused", async ({ harness }) => {
  const owner = await harness.principalFor((await harness.actor()).id);
  const file = await personaFile(harness, owner);
  const other = await harness.principalFor((await harness.actor()).id);

  // The bytes sit on this box under the owner; the other account's import never reaches them.
  const first = await harness.services.persona.import({ principal: other, bytes: file.bytes });
  if (!first.ok) {
    throw new Error(first.error);
  }
  expect(first).toMatchObject({ created: true, persona: { name: "Wanderer", avatarAssetId: null, avatarHash: null } });
  expect(await harness.services.persona.import({ principal: other, bytes: file.bytes })).toMatchObject({
    ok: true,
    created: false,
    persona: { id: first.persona.id },
  });
  const listed = await harness.services.persona.list({ principal: other });
  expect(listed.filter((persona) => persona.name.startsWith("Wanderer")).map((persona) => persona.id)).toEqual([first.persona.id]);
});

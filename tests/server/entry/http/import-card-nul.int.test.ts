// @subject packages/db/src/custom-types/index.ts
// @subject packages/kit/src/stable-stringify/index.ts
// A NUL is not text in this app, so a card imported with a NUL in a field is stored without it and reads back whole.
// Its identities are the text it was stored as: the same card without the NUL imports as that character, not a second
// one, and its content hash, the basis an edit is checked against, is the NUL-free card's.
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import { cardImportResultSchema } from "@orb/contracts/import";
import { PORTABILITY_ROUTES } from "@orb/contracts/portability";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import { CSRF_HEADERS } from "./_body-limit-inputs.ts";

const NUL = "\0";
const DESCRIPTION = ["The keeper tends the harbor light", " through every storm."] as const;

// SillyTavern wire text is snake_case by spec, so the fixture is raw JSON text; JSON spells the NUL as an escape.
function card(description: string): string {
  return JSON.stringify({ spec: "chara_card_v2", ["spec_version"]: "2.0", data: { name: "Harbor Keeper", description, ["first_mes"]: "Lamp lit." } });
}

async function importCard(root: ServerTestHarness, text: string): Promise<ReturnType<typeof cardImportResultSchema.parse>> {
  const form = new FormData();
  form.append("file", new File([text], "keeper.json"));
  const response = await root.http.request(PORTABILITY_ROUTES.importCards, { method: "POST", headers: CSRF_HEADERS, body: form });
  expect(response.status).toBe(200);
  return cardImportResultSchema.parse(await response.json());
}

function ownerRoot(): Promise<ServerTestHarness> {
  return createServerHarness({
    env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner", ["SEED_CONTENT"]: "off" },
    physicalPeer: () => "127.0.0.1",
    startJobs: false,
  });
}

test("a card imported with a NUL in a field reads back whole without it, and the same card without the NUL is that character", async () => {
  await using root = await ownerRoot();
  const principal = await root.principalFor(root.ownerId);

  const first = await importCard(root, card(DESCRIPTION.join(NUL)));
  const [imported] = first.imported;
  if (imported === undefined) {
    throw new Error(`the NUL-bearing card did not import: ${JSON.stringify(first.failed)}`);
  }
  expect(imported.created).toBe(true);
  expect((await root.services.character.get({ principal, characterId: imported.characterId })).description).toBe(DESCRIPTION.join(""));

  const again = await importCard(root, card(DESCRIPTION.join("")));
  expect(again.imported).toMatchObject([{ characterId: imported.characterId, created: false, importHash: imported.importHash }]);

  // The NUL-free card stored on its own has the same content hash.
  await using clean = await ownerRoot();
  const [cleanImport] = (await importCard(clean, card(DESCRIPTION.join("")))).imported;
  if (cleanImport === undefined) {
    throw new Error("the NUL-free card did not import");
  }
  const cleanPrincipal = await clean.principalFor(clean.ownerId);
  expect((await root.services.character.get({ principal, characterId: imported.characterId })).contentHash).toBe(
    (await clean.services.character.get({ principal: cleanPrincipal, characterId: cleanImport.characterId })).contentHash,
  );
});

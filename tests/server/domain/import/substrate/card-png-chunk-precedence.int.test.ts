// @subject packages/server/src/domain/import/substrate/card.ts
// A card PNG carries the card twice: ccv3 (V3) and chara (V2). The import reads ccv3 when it is intact, and the chara
// chunk only when ccv3 is missing or fails its CRC, so two disagreeing chunks import as the ccv3 card.
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import { cardImportResultSchema } from "@orb/contracts/import";
import { PORTABILITY_ROUTES } from "@orb/contracts/portability";
import { ID_PREFIX } from "@orb/kit/ids";
import { writeCardChunk } from "@orb/kit/png-card-chunk";
import { present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, makeAssetBytes } from "@orb/testkit/node/composed";
import { CSRF_HEADERS } from "../../../entry/http/_body-limit-inputs.ts";

const CCV3_NAME = "Ccv3 Keeper";
const CHARA_NAME = "Chara Keeper";

function card(name: string): string {
  return `{"spec":"chara_card_v2","spec_version":"2.0","data":{"name":${JSON.stringify(name)},"description":"${name} keeps the harbor light.","first_mes":"The lamp is lit."}}`;
}

// A chunk's span: its 4-byte length sits before the type, and length, type and CRC add 12 bytes to the payload.
function chunkSpan(png: Uint8Array, keyword: "chara" | "ccv3"): readonly [number, number] {
  const start = Buffer.from(png).indexOf(`tEXt${keyword}\0`, 0, "latin1") - 4;
  expect(start).toBeGreaterThan(0);
  return [start, start + 12 + new DataView(png.buffer, png.byteOffset).getUint32(start)];
}

function splice(png: Uint8Array, [start, end]: readonly [number, number], replacement: Uint8Array): Uint8Array {
  return Uint8Array.from([...png.subarray(0, start), ...replacement, ...png.subarray(end)]);
}

// The ccv3 card's PNG with its chara chunk swapped for the chara card's, so the two chunks disagree.
function disagreeingCard(root: ServerTestHarness): Uint8Array {
  const art = makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset));
  const ccv3Card = writeCardChunk(art, card(CCV3_NAME));
  const charaCard = writeCardChunk(art, card(CHARA_NAME));
  const [start, end] = chunkSpan(charaCard, "chara");
  return splice(ccv3Card, chunkSpan(ccv3Card, "chara"), charaCard.subarray(start, end));
}

async function importedName(root: ServerTestHarness, png: Uint8Array): Promise<string> {
  const form = new FormData();
  form.append("file", new File([new Uint8Array(png)], "keeper.png"));
  const response = await root.http.request(PORTABILITY_ROUTES.importCards, { method: "POST", headers: CSRF_HEADERS, body: form });
  expect(response.status).toBe(200);
  const result = cardImportResultSchema.parse(await response.json());
  expect(result.failed).toEqual([]);
  const caller = await root.internalCallerFor(root.ownerId);
  return (await caller.character.get({ characterId: present(result.imported[0]).characterId })).name;
}

function harness(): Promise<ServerTestHarness> {
  return createServerHarness({
    env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner", ["SEED_CONTENT"]: "off" },
    physicalPeer: () => "127.0.0.1",
    startJobs: false,
  });
}

test("two intact chunks that disagree import as the ccv3 card", async () => {
  await using root = await harness();
  expect(await importedName(root, disagreeingCard(root))).toBe(CCV3_NAME);
});

test("a ccv3 chunk that fails its CRC yields to the chara chunk", async () => {
  await using root = await harness();
  const png = disagreeingCard(root);
  const [, end] = chunkSpan(png, "ccv3");
  const broken = png.slice();
  broken[end - 1] = 0xff - (png[end - 1] ?? 0);
  expect(await importedName(root, broken)).toBe(CHARA_NAME);
});

test("a card with only its chara chunk imports from it", async () => {
  await using root = await harness();
  const png = disagreeingCard(root);
  expect(await importedName(root, splice(png, chunkSpan(png, "ccv3"), new Uint8Array(0)))).toBe(CHARA_NAME);
});

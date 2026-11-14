// Each card the Characters dialog upload cannot import comes back with the reason it failed, so a client says why in its own words
// without reading the server's sentence. A card that is no card, a card whose data fails validation, and a card the storage edge
// refuses each carry their own reason, and a card in the same batch still lands.
// @subject packages/server/src/domain/import/loader/import-card-batch.ts
// @subject packages/server/src/entry/http/upload.ts

import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import type { FailedCardReason } from "@orb/contracts/import";
import { CARD_REFUSAL_CODES, cardImportResultSchema, FAILED_CARD_REASONS } from "@orb/contracts/import";
import { PORTABILITY_ROUTES } from "@orb/contracts/portability";
import { UPLOAD_FILE_FIELD } from "@orb/contracts/uploads";
import { characters } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, refuseWrites } from "@orb/testkit/node/composed";
import { CSRF_HEADERS } from "./_body-limit-inputs.ts";

type CardImportResult = ReturnType<typeof cardImportResultSchema.parse>;

const GOOD_FILE = "keeper.json";
const REFUSED_FILE = "refused.json";
// Far past any character name cap, so the card decodes and then fails the canonical schema.
const OVERLONG_NAME_LENGTH = 10_000;
const FAULT_MESSAGE = "storage refused the character row";
const [UNREADABLE, INVALID] = CARD_REFUSAL_CODES;

// SillyTavern wire text is snake_case by spec, so the fixtures are raw JSON text.
function card(name: string): string {
  return JSON.stringify({
    spec: "chara_card_v2",
    ["spec_version"]: "2.0",
    data: { name, description: `${name} keeps the harbor light.`, ["first_mes"]: "Lamp lit." },
  });
}

function harness(): Promise<ServerTestHarness> {
  return createServerHarness({
    env: { [AUTH_MODE_KEY]: "single-user", [AUTH_FALLBACK_KEY]: "owner", ["SEED_CONTENT"]: "off" },
    physicalPeer: () => "127.0.0.1",
    startJobs: false,
  });
}

/** The Characters dialog door over several files, in order. */
async function dialog(root: ServerTestHarness, files: Readonly<Record<string, string>>): Promise<CardImportResult> {
  const form = new FormData();
  for (const [filename, text] of Object.entries(files)) {
    form.append(UPLOAD_FILE_FIELD, new File([text], filename));
  }
  const response = await root.http.request(PORTABILITY_ROUTES.importCards, { method: "POST", headers: CSRF_HEADERS, body: form });
  expect(response.status).toBe(200);
  return cardImportResultSchema.parse(await response.json());
}

/** A refused card beside a good one: the good one lands whatever happened to the other. */
async function refusedBesideGood(root: ServerTestHarness, refused: string): Promise<CardImportResult> {
  const result = await dialog(root, { [GOOD_FILE]: card("Harbor Keeper"), [REFUSED_FILE]: refused });
  expect(result.imported).toMatchObject([{ filename: GOOD_FILE, created: true }]);
  return result;
}

// A total `Record` over the wire's reason tuple, so a new reason fails `tsc` until it has a way to be provoked here.
const PROVOKE: Record<FailedCardReason, (root: ServerTestHarness) => Promise<CardImportResult>> = {
  [UNREADABLE]: (root) => refusedBesideGood(root, "{ not json"),
  [INVALID]: (root) => refusedBesideGood(root, card("x".repeat(OVERLONG_NAME_LENGTH))),
  // The storage edge refuses every character row, so the card is a good one that could not be written; once the storage
  // takes it again the same card lands, which proves the refusal was the storage's.
  failed: async (root) => {
    await using fault = await refuseWrites(root.db, { table: characters, event: "INSERT", message: FAULT_MESSAGE });
    const refused = await dialog(root, { [REFUSED_FILE]: card("Harbor Keeper") });
    expect(refused.imported).toEqual([]);
    await fault.lift();
    const landed = await dialog(root, { [REFUSED_FILE]: card("Harbor Keeper") });
    expect(landed).toMatchObject({ imported: [{ filename: REFUSED_FILE, created: true }], failed: [] });
    return refused;
  },
};

test.for(FAILED_CARD_REASONS)("a file refused as %s carries that reason on the wire", async (reason) => {
  await using root = await harness();

  const result = await PROVOKE[reason](root);

  expect(result.failed).toMatchObject([{ filename: REFUSED_FILE, reason }]);
});

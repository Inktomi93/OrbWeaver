// domain/credentials/substrate/stored — the two steps every secret-writing verb shares, over a real db: the
// storage refusal when no CREDENTIALS_KEY is configured, and the read-back of the row just written as its
// secret-free view, owner-scoped, with a coded refusal when the row is not there.

import type { UserCredentialId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { CREDENTIALS_OP_CODES } from "../../../../../packages/server/src/domain/credentials/contract/errors.ts";
import { reloadView, requireStorage } from "../../../../../packages/server/src/domain/credentials/substrate/stored.ts";
import { createSecretBox } from "../../../../../packages/server/src/infra/crypto/secrets.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, seedCredential, seedUser } from "../_support.ts";

describe("requireStorage", () => {
  test("refuses with the disabled code when the box has no key", async () => {
    const db = await freshDb();
    const { ctx } = makeHarness(db);
    expect(() => requireStorage({ ...ctx, box: createSecretBox(null) })).toThrow(expect.objectContaining({ code: CREDENTIALS_OP_CODES.disabled }));
  });

  test("control: passes when a key is configured", async () => {
    const db = await freshDb();
    expect(() => requireStorage(makeHarness(db).ctx)).not.toThrow();
  });
});

describe("reloadView", () => {
  test("reads the owner's row back as its view, with no secret on it", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const { owner, cred } = await seedCredential(db, h, { key: "sk-live-secret", label: "work" });
    const view = await reloadView(h.ctx, owner, cred.id);
    expect(view).toEqual(cred);
    expect(JSON.stringify(view)).not.toContain("sk-live-secret");
  });

  test("another user's id reads as not found, never as the row", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const { cred } = await seedCredential(db, h);
    const stranger = await seedUser(db, { id: "user_stranger" });
    await expect(reloadView(h.ctx, stranger, cred.id)).rejects.toMatchObject({ code: CREDENTIALS_OP_CODES.notFound });
  });

  test("a missing id reads as not found", async () => {
    const db = await freshDb();
    const h = makeHarness(db);
    const owner = await seedUser(db, { id: "user_owner" });
    await expect(reloadView(h.ctx, owner, castId<UserCredentialId>("user_credential_missing"))).rejects.toMatchObject({
      code: CREDENTIALS_OP_CODES.notFound,
    });
  });
});

// verb: probeKeyDecrypt — the boot decrypt-probe. Asserts: enabled box with no credentials → true;
// enabled box with a valid credential → true; enabled box with a credential under a DIFFERENT key → false.

import type { UserCredentialId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createCredentialsService } from "@orb/server/domain/credentials";
import { createSecretBox } from "@orb/server/infra/crypto";
import { describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeHarness, principal, seedUser } from "../_support.ts";

// A different key to simulate a rotation (all-42s vs the harness all-7s key).
const ROTATED_KEY = Buffer.alloc(32, 42);

describe("probeKeyDecrypt", () => {
  test("returns true when the box is enabled but no credentials exist yet", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const result = await svc.probeKeyDecrypt();
    expect(result).toBe(true);
  });

  test("returns true when the first credential decrypts successfully with the current key", async () => {
    const db = await freshDb();
    const harness = makeHarness(db);
    const svc = createCredentialsService(harness.ctx);
    const owner = await seedUser(db, { id: "user_probe_ok", role: "user" });
    await svc.add({ principal: principal(owner), provider: "openrouter", key: "sk-probe-ok" });
    const result = await svc.probeKeyDecrypt();
    expect(result).toBe(true);
  });

  test("returns false when the first credential was encrypted with a DIFFERENT key (simulated rotation)", async () => {
    const db = await freshDb();
    const harnessA = makeHarness(db);
    const svcA = createCredentialsService(harnessA.ctx);
    const owner = await seedUser(db, { id: "user_probe_rot", role: "user" });
    await svcA.add({ principal: principal(owner), provider: "openrouter", key: "sk-old" });

    // Probe with a DIFFERENT key (all-42s) — the row was sealed under the harness key → decrypt fails.
    let credCounter = 9000;
    const rotatedCtx = {
      ...harnessA.ctx,
      box: createSecretBox(ROTATED_KEY),
      newCredentialId: (): UserCredentialId => castId<UserCredentialId>(`user_credential_${credCounter++}`),
    };
    const svcB = createCredentialsService(rotatedCtx);
    const result = await svcB.probeKeyDecrypt();
    expect(result).toBe(false);
  });
});

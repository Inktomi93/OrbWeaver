// verb: refreshEgressAdmission — the BOOT half of the owner-saved egress admission.
//
// WHY IT HAS ITS OWN TEST: the belt is installed as the FIRST boot step, before the db exists, so its
// owner-saved set is empty on every restart. `entry/lifecycle.ts` calls this verb after compose to refill
// it from the store. Simulating a restart is therefore exactly: keep the rows, empty the module state, call
// the verb — and a saved connection that survives a restart is the whole point (the alternative is a user
// whose Ollama works until the server bounces).
//
// The per-write half (add/remove re-deriving inline) and the owner-vs-member boundary are proven in
// tests/server/domain/credentials/substrate/egress-admission.int.test.ts.

import { createCredentialsService } from "@orb/server/domain/credentials";
import { installEgressFirewall, publishOwnerSavedEndpoints } from "@orb/server/infra/network";
import type { Dispatcher } from "undici";
import { getGlobalDispatcher, setGlobalDispatcher } from "undici";
import { afterAll, beforeAll, describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, principal, seedUser } from "../_support.ts";

function errorChainText(err: unknown): string {
  const parts: string[] = [];
  let cur: unknown = err;
  for (let depth = 0; depth < 6 && cur !== null && cur !== undefined; depth++) {
    parts.push(cur instanceof Error ? `${cur.name}: ${cur.message}` : String(cur));
    cur = cur instanceof Error ? (cur as { cause?: unknown }).cause : undefined;
  }
  return parts.join(" <- ");
}

/** `true` = SSRF_BLOCKED (never dialled); `false` = the connect was attempted (nothing listens). */
async function blocked(url: string): Promise<boolean> {
  const err = await fetch(url).catch((e: unknown) => e);
  return errorChainText(err).includes("SSRF_BLOCKED");
}

const SAVED = "http://127.0.0.3:11434/v1";
const PROBE = "http://127.0.0.3:11434/v1/models";

describe("refreshEgressAdmission", () => {
  const original: Dispatcher = getGlobalDispatcher();
  beforeAll(() => {
    installEgressFirewall();
  });
  afterAll(() => {
    publishOwnerSavedEndpoints([]);
    setGlobalDispatcher(original);
  });

  test("refills the belt from the store after a restart (empty module state, rows intact)", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_owner", role: "owner" });
    await svc.add({
      principal: principal(owner, "owner"),
      provider: "custom_openai",
      key: "",
      metadata: { kind: "custom_openai", baseUrl: SAVED },
    });

    // The restart: the process-global admission set is what a fresh boot starts with.
    publishOwnerSavedEndpoints([]);
    expect(await blocked(PROBE)).toBe(true);

    await svc.refreshEgressAdmission();
    expect(await blocked(PROBE)).toBe(false);
  });

  test("a box with no owner row admits nothing — a member's saved endpoint is not the owner's", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const member = await seedUser(db, { id: "user_member", role: "user" });
    await svc.add({
      principal: principal(member),
      provider: "custom_openai",
      key: "",
      metadata: { kind: "custom_openai", baseUrl: SAVED },
    });

    await svc.refreshEgressAdmission();
    expect(await blocked(PROBE)).toBe(true);
  });
});

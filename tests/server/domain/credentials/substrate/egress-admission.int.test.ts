// substrate: egress-admission — the OWNER's saved connection endpoints widen the SSRF egress belt, and
// nobody else's ever do.
//
// THE PRODUCT BUG THIS CLOSES: a user adds Ollama / KoboldCpp / LM Studio / TabbyAPI at a loopback or LAN
// address in Settings → Connections and every request is refused ("blocked … private address") until they
// hand-edit `EGRESS_ALLOWLIST`. THE SECURITY BOUNDARY IT MUST NOT BREAK: a MEMBER saving the same row must
// widen nothing — a member who could open `169.254.169.254` or the LAN is the attack this belt exists for.
//
// Driven end to end against the REAL global dispatcher through the REAL `add`/`remove` verbs, because the
// defect and the attack both live at the socket, not in a derivation's return value. `EGRESS_ALLOWLIST` is
// unset here (the runner's env floor), so every pass below is earned by the owner-saved admission alone.
//
// OFFLINE + DETERMINISTIC. A BLOCKED target is never dialled (the connector rejects before the socket), and
// an ADMITTED one is a loopback alias with nothing listening — an instant ECONNREFUSED, which is precisely
// the tell that the belt let the connect happen. 127.0.0.2 is used rather than a real LAN box so no verdict
// depends on this machine's network, and 11434 is Ollama's real port (the stranger's case).

import { createCredentialsService } from "@orb/server/domain/credentials";
import { installEgressFirewall, publishOwnerSavedEndpoints } from "@orb/server/infra/network";
import type { Dispatcher } from "undici";
import { getGlobalDispatcher, setGlobalDispatcher } from "undici";
import { afterAll, beforeAll, describe } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeHarness, principal, seedUser } from "../_support.ts";

/** Flatten the error → `.cause` chain: undici wraps a connect rejection as a "fetch failed" TypeError whose
 *  cause carries our SSRF_BLOCKED signal (the egress.int.test helper, same contract). */
function errorChainText(err: unknown): string {
  const parts: string[] = [];
  let cur: unknown = err;
  for (let depth = 0; depth < 6 && cur !== null && cur !== undefined; depth++) {
    parts.push(cur instanceof Error ? `${cur.name}: ${cur.message}` : String(cur));
    cur = cur instanceof Error ? (cur as { cause?: unknown }).cause : undefined;
  }
  return parts.join(" <- ");
}

/** Did the belt refuse this target? `true` = SSRF_BLOCKED (never dialled); `false` = the connect was
 *  attempted (nothing listens → ECONNREFUSED), which is the only observable proof of admission. */
async function blocked(url: string): Promise<boolean> {
  const err = await fetch(url).catch((e: unknown) => e);
  return errorChainText(err).includes("SSRF_BLOCKED");
}

const OWNER_ENDPOINT = "http://127.0.0.2:11434/v1";
const MEMBER_ENDPOINT = "http://192.168.77.77:11434/v1";

describe("egress-admission — owner-saved connection endpoints", () => {
  const original: Dispatcher = getGlobalDispatcher();
  beforeAll(() => {
    installEgressFirewall();
  });
  afterAll(() => {
    // Both are PROCESS-GLOBAL: leaving the firewall installed would break a sibling suite's real loopback
    // fetch, and leaving an admission published would hand it an open door it never asked for.
    publishOwnerSavedEndpoints([]);
    setGlobalDispatcher(original);
  });

  test("RED-FIRST: the owner's endpoint is refused while nothing is published (the shipped bug)", async () => {
    publishOwnerSavedEndpoints([]);
    expect(await blocked("http://127.0.0.2:11434/v1/models")).toBe(true);
  });

  test("the OWNER saving custom_openai admits exactly that host:port — no EGRESS_ALLOWLIST edit", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_owner", role: "owner" });

    await svc.add({
      principal: principal(owner, "owner"),
      provider: "custom_openai",
      key: "",
      metadata: { kind: "custom_openai", baseUrl: OWNER_ENDPOINT },
    });

    expect(await blocked("http://127.0.0.2:11434/v1/models")).toBe(false);
    // LEAST PRIVILEGE: the admission is the exact host:PORT, never the host. A second port on the same box
    // (an ssh forward, an admin UI, a port scan) stays refused.
    expect(await blocked("http://127.0.0.2:9998/x")).toBe(true);
  });

  test("a MEMBER saving the same kind of row widens NOTHING (the attack)", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_owner", role: "owner" });
    const member = await seedUser(db, { id: "user_member", role: "user" });
    // The owner has their own saved endpoint, so the derivation is live and publishing — this test is about
    // WHOSE rows it reads, not about whether it ran.
    await svc.add({
      principal: principal(owner, "owner"),
      provider: "custom_openai",
      key: "",
      metadata: { kind: "custom_openai", baseUrl: OWNER_ENDPOINT },
    });

    await svc.add({
      principal: principal(member),
      provider: "custom_openai",
      key: "",
      metadata: { kind: "custom_openai", baseUrl: MEMBER_ENDPOINT },
    });

    expect(await blocked("http://192.168.77.77:11434/v1/models")).toBe(true);
    // …and the member's write did not close the owner's door either (the republish is whole-set, and the
    // set it re-derives is the OWNER's).
    expect(await blocked("http://127.0.0.2:11434/v1/models")).toBe(false);
  });

  test("a member cannot reach cloud metadata by saving it (169.254.169.254 is never admissible)", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const member = await seedUser(db, { id: "user_member", role: "user" });
    await seedUser(db, { id: "user_owner", role: "owner" });
    await svc.add({
      principal: principal(member),
      provider: "custom_openai",
      key: "",
      metadata: { kind: "custom_openai", baseUrl: "http://169.254.169.254/latest" },
    });
    expect(await blocked("http://169.254.169.254/latest/meta-data/")).toBe(true);
  });

  test("not even the OWNER can admit cloud metadata — the link-local refusal is at the mint", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_owner", role: "owner" });
    await svc.add({
      principal: principal(owner, "owner"),
      provider: "custom_openai",
      key: "",
      metadata: { kind: "custom_openai", baseUrl: "http://169.254.169.254/latest" },
    });
    expect(await blocked("http://169.254.169.254/latest/meta-data/")).toBe(true);
  });

  test("REMOVING the owner's connection shuts the door on the next check", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_owner", role: "owner" });
    const cred = await svc.add({
      principal: principal(owner, "owner"),
      provider: "custom_openai",
      key: "",
      metadata: { kind: "custom_openai", baseUrl: OWNER_ENDPOINT },
    });
    expect(await blocked("http://127.0.0.2:11434/v1/models")).toBe(false);

    await svc.remove({ principal: principal(owner, "owner"), credentialId: cred.id });
    expect(await blocked("http://127.0.0.2:11434/v1/models")).toBe(true);
  });

  test("RE-POINTING the connection closes the old host:port and opens the new one", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_owner", role: "owner" });
    const saved = {
      principal: principal(owner, "owner"),
      provider: "custom_openai",
      key: "",
    } as const;
    await svc.add({ ...saved, metadata: { kind: "custom_openai", baseUrl: OWNER_ENDPOINT } });
    expect(await blocked("http://127.0.0.2:11434/v1/models")).toBe(false);

    // Same (owner, provider, label) slot ⇒ the rotate arm, which REPLACES the row's metadata.
    await svc.add({ ...saved, metadata: { kind: "custom_openai", baseUrl: "http://127.0.0.2:11500/v1" } });
    expect(await blocked("http://127.0.0.2:11434/v1/models")).toBe(true);
    expect(await blocked("http://127.0.0.2:11500/v1/models")).toBe(false);
  });

  // A HOSTNAME endpoint (the docker/stranger spelling) takes a DIFFERENT connector arm from an IP literal:
  // it resolves at connect time through a gate that refuses only the never-admissible ranges, so a declared
  // name cannot launder 169.254.169.254. DECLARED LIMIT: only the ADMIT direction is provable offline —
  // the deny direction needs a hostname that resolves to link-local, which no hermetic fixture provides
  // (the range membership itself is `isInRanges`, pinned in tests/server/infra/network/ip-ranges.test.ts).
  test("a hostname endpoint (localhost, the docker spelling) is admitted and resolves through the saved-host gate", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_owner", role: "owner" });
    await svc.add({
      principal: principal(owner, "owner"),
      provider: "custom_openai",
      key: "",
      metadata: { kind: "custom_openai", baseUrl: "http://localhost:11434/v1" },
    });
    expect(await blocked("http://localhost:11434/v1/models")).toBe(false);
    // Still port-scoped after a DNS hop: the same NAME on another port is refused.
    expect(await blocked("http://localhost:9998/x")).toBe(true);
  });

  test("a non-endpoint provider row contributes no admission (openrouter carries no baseUrl)", async () => {
    const db = await freshDb();
    const svc = createCredentialsService(makeHarness(db).ctx);
    const owner = await seedUser(db, { id: "user_owner", role: "owner" });
    await svc.add({ principal: principal(owner, "owner"), provider: "openrouter", key: "k" });
    expect(await blocked("http://127.0.0.2:11434/v1/models")).toBe(true);
  });
});

// D254 — the pending OIDC join verbs over a real db: the callback's record, the preview's read, and the
// confirm's plan through `decideProvision`, which refuses an identity that may no longer join.

import type { ResolvedIdentity } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { oidcPendingSignups } from "@orb/db";
import type { ExternalId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SessionsService } from "@orb/server/domain/sessions";
import { afterEach, beforeEach, describe, vi } from "vitest";
import { freshDb } from "../../../../support/db.ts";
import { seedUser } from "../../../../support/factories/index.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeService } from "../_support.ts";

const PENDING_TTL_MS = 600_000;
const INVITE_HASH = "invite-hash";

let db: Db;
let svc: SessionsService;
let clock: ReturnType<typeof makeService>["clock"];

function identity(name: string, over: Partial<ResolvedIdentity> = {}): ResolvedIdentity & { readonly externalId: ExternalId } {
  return { handle: castId<Handle>(name), email: `${name}@example.test`, groups: [], ...over, externalId: castId<ExternalId>(`idp|${name}`) };
}

beforeEach(async () => {
  db = await freshDb();
  ({ svc, clock } = makeService(db));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sessions.recordPendingSignup / readPendingSignup", () => {
  test("the secret reads back the invite hash; the row stores only the secret's hash", async () => {
    const secret = await svc.recordPendingSignup({ identity: identity("friend"), inviteTokenHash: INVITE_HASH, idToken: null });
    expect(await svc.readPendingSignup(secret)).toEqual({ inviteTokenHash: INVITE_HASH });
    expect(JSON.stringify(await db.select().from(oidcPendingSignups))).not.toContain(secret);
    expect(await svc.readPendingSignup("not-a-secret")).toBeNull();
  });

  test("a second callback for the subject replaces the first: the old secret reads nothing", async () => {
    const first = await svc.recordPendingSignup({ identity: identity("friend"), inviteTokenHash: INVITE_HASH, idToken: null });
    const second = await svc.recordPendingSignup({ identity: identity("friend"), inviteTokenHash: INVITE_HASH, idToken: null });
    expect(await svc.readPendingSignup(first)).toBeNull();
    expect(await svc.readPendingSignup(second)).not.toBeNull();
    expect(await db.select().from(oidcPendingSignups)).toHaveLength(1);
  });

  test("a pending join past its window reads nothing", async () => {
    const secret = await svc.recordPendingSignup({ identity: identity("friend"), inviteTokenHash: INVITE_HASH, idToken: null });
    clock.advance(PENDING_TTL_MS);
    expect(await svc.readPendingSignup(secret)).toBeNull();
  });
});

describe("sessions.preparePendingSignup", () => {
  test("plans a fresh enabled account and opens the sealed id_token", async () => {
    const secret = await svc.recordPendingSignup({ identity: identity("friend"), inviteTokenHash: INVITE_HASH, idToken: "id-token" });
    const plan = await svc.preparePendingSignup({ secret, requireApproval: false });
    expect(plan).toMatchObject({ inviteTokenHash: INVITE_HASH, handle: "friend", enabled: true, oidcIdToken: "id-token" });
  });

  test("under approval the planned account is disabled", async () => {
    const secret = await svc.recordPendingSignup({ identity: identity("friend"), inviteTokenHash: INVITE_HASH, idToken: null });
    expect((await svc.preparePendingSignup({ secret, requireApproval: true }))?.enabled).toBe(false);
  });

  test("refuses an owner-by-policy identity, a tightened access gate, and an identity that now has an account", async () => {
    vi.stubEnv("OWNER_HANDLES", "boss");
    const owner = await svc.recordPendingSignup({ identity: identity("boss"), inviteTokenHash: INVITE_HASH, idToken: null });
    expect(await svc.preparePendingSignup({ secret: owner, requireApproval: false })).toBeNull();

    const gated = await svc.recordPendingSignup({ identity: identity("gated"), inviteTokenHash: INVITE_HASH, idToken: null });
    vi.stubEnv("OIDC_ALLOWED_GROUPS", "friends");
    expect(await svc.preparePendingSignup({ secret: gated, requireApproval: false })).toBeNull();
    vi.stubEnv("OIDC_ALLOWED_GROUPS", undefined);

    const taken = await svc.recordPendingSignup({ identity: identity("taken"), inviteTokenHash: INVITE_HASH, idToken: null });
    await seedUser(db, { handle: castId<Handle>("taken") });
    expect(await svc.preparePendingSignup({ secret: taken, requireApproval: false })).toBeNull();
  });

  test("control: an unknown secret plans nothing", async () => {
    expect(await svc.preparePendingSignup({ secret: "unknown", requireApproval: false })).toBeNull();
  });
});

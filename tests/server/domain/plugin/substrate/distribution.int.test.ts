// substrate/distribution — the per-recipient half of every fan-out. Pins the header's load-bearing claims
// directly (the fan-out verbs' own int tests pin the end-to-end idempotency/consent-pending SHAPE): `alreadyHolds`
// checks by slug regardless of version, and `installDistributedCopy` drives TWO real verb calls under the
// recipient's own Principal — `install` with an empty grant, THEN `setGrant` with an empty grant — landing the
// row installed/disabled/ungranted rather than a fabricated row that skips the real hardening path.

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { alreadyHolds, installDistributedCopy } from "../../../../../packages/server/src/domain/plugin/substrate/distribution.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeBundle, makePluginHarness, ownerPrincipalFor, seedUser } from "../_support.ts";

describe("alreadyHolds", () => {
  test("false when the recipient holds nothing at that slug; true once installed, regardless of version", async () => {
    const db = await freshDb();
    const h = makePluginHarness(db);
    const recipient = await seedUser(db, { handle: castId<Handle>("recipient") });
    const principal = ownerPrincipalFor(recipient);

    expect(await alreadyHolds(h.ctx, principal, "house-style")).toBe(false);

    await installDistributedCopy(h.service, principal, makeBundle({ id: "house-style", capabilities: [] }));

    expect(await alreadyHolds(h.ctx, principal, "house-style")).toBe(true);
  });
});

describe("installDistributedCopy", () => {
  test("lands the row installed/disabled with ZERO granted capabilities — consent-first, two real verb calls", async () => {
    const db = await freshDb();
    const h = makePluginHarness(db);
    const recipient = await seedUser(db, { handle: castId<Handle>("recipient") });
    const principal = ownerPrincipalFor(recipient);

    await installDistributedCopy(h.service, principal, makeBundle({ id: "house-style", capabilities: ["chat.transform"] }));

    const [row] = await h.service.list({ caller: principal });
    expect(row).toMatchObject({ slug: "house-style", status: "disabled", grantedCapabilities: [] });
    // The consent posture: a distributed copy raises the standing re-consent ask (the setGrant half).
    expect(row?.reconsentPending).toBe(true);
    // Never activated by the fan-out itself.
    expect(h.port.created).toEqual([]);
  });

  test("a real install refusal (malformed bundle) propagates — a fan-out never reports a served recipient who was not", async () => {
    const db = await freshDb();
    const h = makePluginHarness(db);
    const recipient = await seedUser(db, { handle: castId<Handle>("recipient") });

    await expect(installDistributedCopy(h.service, ownerPrincipalFor(recipient), new Uint8Array([1, 2, 3]))).rejects.toThrow();
  });
});

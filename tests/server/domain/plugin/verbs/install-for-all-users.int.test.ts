// verb: installForAllUsers — the SERVER-WIDE install as an ADMIN-TRIGGERED FAN-OUT OF PER-USER ROWS (D147
// clause (d)). The load-bearing assertions here are the AUTHORITY one and the CONSENT one, in that order:
//
//   1. it is the ONE admin verb in this domain, so a plain user is refused before anything is written — and
//      "before" is asserted as ZERO distribution records and ZERO rows, not just as a thrown error;
//   2. what it mints can do NOTHING. Every recipient's copy is disabled, granted nothing, and standing a
//      consent ask. A fan-out that landed an ENABLED row would be D147 clause (b)'s confused deputy — one
//      user's untrusted bundle running under everyone else's identity — so the posture is asserted PER ROW
//      for every recipient, never once for a sample.
//
// The third is that a recipient's own consent path still works end to end afterwards (#677's per-owner tool
// registry is what makes N users enabling the same slug possible at all), which is what makes the mint a real
// install rather than a decorative row.

import { DomainForbiddenError } from "@orb/kit/errors";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { listDistributions } from "../../../../../packages/server/src/domain/plugin/persistence/distributed-plugins.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeBundle, makePluginHarness, ownerPrincipalFor, principalFor, seedUser } from "../_support.ts";

/** Three ordinary members plus the box owner who publishes to them. */
async function cast(db: Awaited<ReturnType<typeof freshDb>>): Promise<{
  readonly boss: UserId;
  readonly members: readonly UserId[];
}> {
  const boss = await seedUser(db, { handle: castId<Handle>("boss") });
  const ann = await seedUser(db, { handle: castId<Handle>("ann") });
  const bo = await seedUser(db, { handle: castId<Handle>("bo") });
  const cy = await seedUser(db, { handle: castId<Handle>("cy") });
  return { boss, members: [ann, bo, cy] };
}

test("an admin publish lands a row for EVERY user — each disabled, granted nothing, standing a consent ask", async () => {
  const db = await freshDb();
  const { boss, members } = await cast(db);
  const recipients = members.map((id) => principalFor(id));
  const h = makePluginHarness(db, { listRecipients: () => Promise.resolve(recipients) });

  const result = await h.service.installForAllUsers({
    caller: ownerPrincipalFor(boss),
    bundle: makeBundle({ id: "house-style", name: "House Style", capabilities: ["chat.transform"] }),
  });

  expect(result).toMatchObject({ slug: "house-style", name: "House Style", version: "1.0.0", applied: 3, skipped: [] });
  for (const member of members) {
    const rows = await h.service.list({ caller: principalFor(member) });
    expect(
      rows.map((r) => r.slug),
      member,
    ).toEqual(["house-style"]);
    // THE CONSENT POSTURE, per recipient: present, off, allowed nothing, and standing an ask.
    expect(rows[0]?.status, member).toBe("disabled");
    expect(rows[0]?.grantedCapabilities, member).toEqual([]);
    expect(rows[0]?.reconsentPending, member).toBe(true);
    expect(rows[0]?.declaredCapabilities, member).toEqual(["chat.transform"]);
  }
  // Nothing ran: a publish activates nothing for anyone.
  expect(h.port.created).toEqual([]);
  // …and the deployment now records the bundle, once.
  expect((await listDistributions(db)).map((d) => ({ slug: d.slug, version: d.version, distributedBy: d.distributedBy }))).toEqual([
    { slug: "house-style", version: "1.0.0", distributedBy: boss },
  ]);
});

test("a NON-ADMIN caller is refused, and nothing at all is written", async () => {
  const db = await freshDb();
  const { members } = await cast(db);
  const [ann, bo] = members;
  const recipients = members.map((id) => principalFor(id));
  const h = makePluginHarness(db, { listRecipients: () => Promise.resolve(recipients) });

  await expect(h.service.installForAllUsers({ caller: principalFor(ann as UserId), bundle: makeBundle({ id: "house-style" }) })).rejects.toBeInstanceOf(
    DomainForbiddenError,
  );

  // The refusal precedes every write — no record, no rows, no CAS bytes. An admin gate that threw AFTER the
  // publish would leave a plain user able to seed the deployment and then read an error.
  expect(await listDistributions(db)).toEqual([]);
  expect(await h.service.list({ caller: principalFor(bo as UserId) })).toEqual([]);
  expect(h.storedBytes.size).toBe(0);
});

test("a user who already holds the slug is SKIPPED and reported — their own row is never touched", async () => {
  const db = await freshDb();
  const { boss, members } = await cast(db);
  const [ann, bo, cy] = members;
  const recipients = members.map((id) => principalFor(id));
  const h = makePluginHarness(db, { listRecipients: () => Promise.resolve(recipients) });

  // Ann installed it herself first, at her own version, with a REAL grant she chose.
  const hers = await h.service.install({
    caller: principalFor(ann as UserId),
    bundle: makeBundle({ id: "house-style", version: "2.0.0", capabilities: ["chat.transform"] }),
    grant: ["chat.transform"],
  });

  const result = await h.service.installForAllUsers({
    caller: ownerPrincipalFor(boss),
    bundle: makeBundle({ id: "house-style", capabilities: ["chat.transform"] }),
  });

  expect(result.applied).toBe(2);
  // The skip NAMES the user — id and handle both, since the only reader is a human admin deciding whether to
  // chase it up. (`userHandle` is the recipient PRINCIPAL's handle; this harness mints it from the user id.)
  expect(result.skipped).toEqual([{ userId: ann, userHandle: principalFor(ann as UserId).handle, reason: "already-installed" }]);
  // ANN'S ROW IS UNTOUCHED — same id, same version, same GRANT. A distribution that "healed" a user's own
  // install would be revoking a consent decision on their behalf.
  const [hersNow] = await h.service.list({ caller: principalFor(ann as UserId) });
  expect(hersNow?.id).toBe(hers.id);
  expect(hersNow?.version).toBe("2.0.0");
  expect(hersNow?.grantedCapabilities).toEqual(["chat.transform"]);
  expect(hersNow?.reconsentPending).toBe(false);
  // …while the two who had nothing got the distributed copy.
  expect((await h.service.list({ caller: principalFor(bo as UserId) })).map((r) => r.version)).toEqual(["1.0.0"]);
  expect((await h.service.list({ caller: principalFor(cy as UserId) })).map((r) => r.version)).toEqual(["1.0.0"]);
});

test("a recipient enables THEIR OWN copy through the real consent path — the fan-out mints real installs", async () => {
  const db = await freshDb();
  const { boss, members } = await cast(db);
  const [ann, bo] = members;
  const recipients = members.map((id) => principalFor(id));
  const h = makePluginHarness(db, { listRecipients: () => Promise.resolve(recipients) });

  await h.service.installForAllUsers({
    caller: ownerPrincipalFor(boss),
    bundle: makeBundle({ id: "house-style", capabilities: ["chat.transform"] }),
  });

  // Ann consents and turns hers on. Bo does nothing.
  const [hers] = await h.service.list({ caller: principalFor(ann as UserId) });
  await h.service.setGrant({
    caller: principalFor(ann as UserId),
    pluginId: hers?.id ?? castId("plugin_missing"),
    grant: ["chat.transform"],
    acknowledgedNetHosts: [],
  });
  await h.service.setEnabled({ caller: principalFor(ann as UserId), pluginId: hers?.id ?? castId("plugin_missing"), enabled: true });

  expect((await h.service.list({ caller: principalFor(ann as UserId) }))[0]).toMatchObject({
    status: "enabled",
    grantedCapabilities: ["chat.transform"],
    reconsentPending: false,
  });
  // Bo's copy is unaffected by Ann's consent — N owners, N independent decisions (the #677 per-owner registry
  // is what lets two users hold the same slug live at once).
  expect((await h.service.list({ caller: principalFor(bo as UserId) }))[0]).toMatchObject({ status: "disabled", grantedCapabilities: [] });
  // Exactly ONE activation happened, and it was Ann's own act.
  expect(h.port.created).toHaveLength(1);
});

test("re-publishing the same slug REPLACES the record and serves only the users still missing it", async () => {
  const db = await freshDb();
  const { boss, members } = await cast(db);
  const recipients = members.map((id) => principalFor(id));
  const h = makePluginHarness(db, { listRecipients: () => Promise.resolve(recipients) });

  await h.service.installForAllUsers({ caller: ownerPrincipalFor(boss), bundle: makeBundle({ id: "house-style" }) });
  const second = await h.service.installForAllUsers({
    caller: ownerPrincipalFor(boss),
    bundle: makeBundle({ id: "house-style", version: "1.1.0", name: "House Style II" }),
  });

  // Everyone already has a copy, so the second publish serves nobody — this is also the RESUME path a failed
  // fan-out relies on (re-run, skip the served, finish the rest).
  expect(second.applied).toBe(0);
  expect(second.skipped.map((s) => s.reason)).toEqual(["already-installed", "already-installed", "already-installed"]);
  // ONE record, at the new version: a slug is the identity, so a re-publish replaces rather than accumulates.
  const records = await listDistributions(db);
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({ slug: "house-style", version: "1.1.0", name: "House Style II" });
});

test("an invalid bundle is refused before the deployment records anything", async () => {
  const db = await freshDb();
  const { boss, members } = await cast(db);
  const h = makePluginHarness(db, { listRecipients: () => Promise.resolve(members.map((id) => principalFor(id))) });

  await expect(h.service.installForAllUsers({ caller: ownerPrincipalFor(boss), bundle: new Uint8Array([1, 2, 3]) })).rejects.toThrow();

  expect(await listDistributions(db)).toEqual([]);
  expect(h.storedBytes.size).toBe(0);
});

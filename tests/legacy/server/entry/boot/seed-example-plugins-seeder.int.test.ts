// The per-user example-plugin seeder on the real release-built bundles: a fresh pass, retry on a missing bundle, the one durable ask, and the #803 auto-upgrade arms.

// @orb-waive-file no-test-fabrication(Record<string, unknown>): baselined when the gate widened to value casts; burn-down item 906.
// @orb-waive-file no-test-fabrication({ dealt: number; countLabel: string }): baselined when the gate widened to value casts; burn-down item 906.

import type { Principal } from "@orb/contracts/identity";
import type { PluginCapability } from "@orb/contracts/plugin";
import type { Handle, PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { createResolveStandingAsks } from "@orb/server/domain/chat";
import { createNotificationsService } from "@orb/server/domain/notifications";
import type { PluginHostOps } from "@orb/server/domain/plugin";
import { FROZEN_AT_MS } from "@orb/testkit/iso/clock.ts";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { unzipSync, zipSync } from "fflate";
import type { ExamplePluginSeederDeps } from "#server/entry/boot/seed-example-plugins.ts";
import { createExamplePluginSeeder } from "#server/entry/boot/seed-example-plugins.ts";
import { makeInertOps, makePluginHarness, ownerPrincipalFor, seedUser } from "../../domain/plugin/_support.ts";
import {
  packShowcaseBundle,
  readShowcaseManifest,
  realHost,
  recordingOps,
  requireHandler,
  requireInvoke,
  SHOWCASE_PLUGIN_SLUGS,
} from "./_seed-example-plugins-support.ts";

/** The two `UserSettings.onboarding` fields the seeder owns, as one mutable object a test can hand to several
 *  seeder INSTANCES in turn — which is what "the next boot" means here (the in-process memo makes a second
 *  `ensureSeeded` on the SAME instance a no-op by design, so a re-run test needs a fresh instance over the
 *  same persisted state). */
interface SeedLatch {
  seeded: boolean;
  versions: Record<string, string>;
}

/** The compose wiring (`entry/compose/services.ts`), against the harness's REAL plugin service and an
 *  in-memory settings latch. Every arm here mirrors a compose line; `overrides` is how one test narrows one
 *  of them (a missing bundle, a bumped version) without re-spelling the other eight. */
function seederDeps(h: ReturnType<typeof makePluginHarness>, latch: SeedLatch, overrides: Partial<ExamplePluginSeederDeps> = {}): ExamplePluginSeederDeps {
  return {
    packBundle: packShowcaseBundle,
    bundledVersion: async (slug): Promise<string | null> => (await readShowcaseManifest(slug))?.version ?? null,
    install: async ({ caller: principal, bundle }) => await h.service.install({ caller: principal, bundle, grant: [] }),
    upgrade: async ({ caller: principal, pluginId, bundle }): Promise<void> => {
      await h.service.upgrade({ caller: principal, pluginId, bundle });
    },
    requestConsent: async ({ caller: principal, pluginId }): Promise<void> => {
      await h.service.setGrant({ caller: principal, pluginId, grant: [], acknowledgedNetHosts: [] });
    },
    listHeld: async (principal) => (await h.service.list({ caller: principal })).map((row) => ({ slug: row.slug, pluginId: row.id, version: row.version })),
    isSeeded: (): Promise<boolean> => Promise.resolve(latch.seeded),
    markSeeded: (): Promise<void> => {
      latch.seeded = true;
      return Promise.resolve();
    },
    readSeededVersions: (): Promise<Readonly<Record<string, string>>> => Promise.resolve(latch.versions),
    writeSeededVersions: (_principal, versions): Promise<void> => {
      latch.versions = { ...versions };
      return Promise.resolve();
    },
    ...overrides,
  };
}

/** A REAL shipped bundle with one field changed: its manifest `version`. Used to stand in for "a later release
 *  of this showcase plugin" without committing a second copy of a bundle — the packer's fixed mtime is reused
 *  so the forged bytes stay a pure function of their inputs, exactly like the shipped ones. `rewriteMain`
 *  forges different guest code too, so a test can tell which version's code is running. */
async function bundleAtVersion(slug: string, version: string, rewriteMain?: (mainJs: string) => string): Promise<Uint8Array> {
  const packed = await packShowcaseBundle(slug);
  // @orb-waive no-test-fabrication(Uint8Array): baselined when the gate widened to value casts; burn-down item 906.
  const entries = unzipSync(packed as Uint8Array);
  const manifest = JSON.parse(new TextDecoder().decode(entries["manifest.json"])) as Record<string, unknown>;
  manifest["version"] = version;
  const mainJs = new TextDecoder().decode(entries["main.js"]);
  const rewritten = rewriteMain === undefined ? mainJs : rewriteMain(mainJs);
  expect(rewritten === mainJs, "the main.js rewrite must change the guest").toBe(rewriteMain === undefined);
  const rebuilt: Record<string, [Uint8Array, { mtime: number }]> = {};
  for (const [name, bytes] of Object.entries(entries)) {
    let replaced = bytes;
    if (name === "manifest.json") {
      replaced = new TextEncoder().encode(JSON.stringify(manifest));
    } else if (name === "main.js") {
      replaced = new TextEncoder().encode(rewritten);
    }
    rebuilt[name] = [replaced, { mtime: FORGED_BUNDLE_MTIME_MS }];
  }
  return zipSync(rebuilt);
}

/** The packer's own fixed stamp (`@orb/showcase-plugins`) — re-stated here rather than exported, because a
 *  TEST forging bytes is not a second packer and must not make the real one's constant part of an API. */
const FORGED_BUNDLE_MTIME_MS = 331_257_600_000;

test("a fresh user's first pass lands every built showcase without a server restart, disabled and UNGRANTED", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db, { port: realHost(), ops: makeInertOps() });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  const latch: SeedLatch = { seeded: false, versions: {} };

  const seeder = createExamplePluginSeeder(seederDeps(h, latch));

  await seeder.ensureSeeded(caller);
  const rows = await h.service.list({ caller });
  expect(rows.map((r) => r.slug).sort()).toEqual([...SHOWCASE_PLUGIN_SLUGS].sort());
  // THE CONSENT POSTURE, asserted on every row: present, off, allowed nothing, and standing an ask.
  for (const row of rows) {
    expect(row.status, row.slug).toBe("disabled");
    expect(row.grantedCapabilities, row.slug).toEqual([]);
    expect(row.reconsentPending, row.slug).toBe(true);
    expect(row.declaredCapabilities.length, row.slug).toBeGreaterThan(0);
  }
  expect(latch.seeded).toBe(true);

  // The in-process memo makes a second call free; clearing it and re-running must still mint nothing (the
  // persisted latch is the DELETION-RESPECT guard — an example the user removed must not come back).
  await seeder.ensureSeeded(caller);
  expect(await h.service.list({ caller })).toHaveLength(SHOWCASE_PLUGIN_SLUGS.length);
});

// #1411 — the LATCH IS A COMPLETENESS CLAIM, not a "the pass ran" claim. `seedOne` returning false for a
// bundle the pack could not produce was fed only into a log-line count, and `markSeeded` ran unconditionally
// after it — so ONE transiently missing bundle latched `examplePluginsSeeded` forever and every later boot
// short-circuited in `isSeeded` before `seedOne` could ever retry. The user silently lost that example for
// the life of the install. The file header's "a missing example skips ONE plugin, it does not fail the pass"
// still holds and is asserted here (the other eight land, nothing throws) — what changed is that an
// incomplete pass no longer LATCHES.
test("a MISSING bundle does not latch — the incomplete pass retries and completes once the bundle appears", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db, { port: realHost(), ops: makeInertOps() });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  const latch: SeedLatch = { seeded: false, versions: {} };
  // A MUTABLE HOLDER, not a bare `let`: biome narrows a `let x = true` initializer and then calls the guard
  // below "always truthy", while a property read is opaque to that narrowing. Same value, no suppression.
  const pack: { absent: boolean } = { absent: true };
  const missingSlug = "oracle-deck";

  const seeder = createExamplePluginSeeder(
    seederDeps(h, latch, { packBundle: async (slug) => (pack.absent && slug === missingSlug ? null : await packShowcaseBundle(slug)) }),
  );

  await seeder.ensureSeeded(caller);
  // The pass did NOT fail: every other example is installed (the header's per-slug tolerance, preserved).
  expect((await h.service.list({ caller })).map((r) => r.slug).sort()).toEqual([...SHOWCASE_PLUGIN_SLUGS].filter((s) => s !== missingSlug).sort());
  // …but it was INCOMPLETE, so it must stay retryable — both the persisted latch and the in-process memo.
  expect(latch.seeded).toBe(false);

  pack.absent = false;
  await seeder.ensureSeeded(caller);
  expect((await h.service.list({ caller })).map((r) => r.slug).sort()).toEqual([...SHOWCASE_PLUGIN_SLUGS].sort());
  expect(latch.seeded).toBe(true);
});

/** The install-time refusals a copied example must not trip: the packer emits only ADMITTED entries, and every
 *  seeded manifest is one the real trust edge accepts. An unknown entry, an over-cap file, a manifest typo — or
 *  (since U4) a `ui.js` whose presence disagrees with its manifest's `uiEntry` in either direction — would be an
 *  install-time refusal for every user on their first request. The SEEDER'S OWN TUPLE is the list under test,
 *  never a hand-written copy of it, so a sixth example is covered the day it is added. */
test("every seeded example packs to a bundle the real install verb accepts", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db, { port: realHost(), ops: makeInertOps() });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  const ids: PluginId[] = [];
  for (const slug of SHOWCASE_PLUGIN_SLUGS) {
    const bundle = await packShowcaseBundle(slug);
    expect(bundle, `${slug} has no packable source directory`).not.toBeNull();
    // @orb-waive no-test-fabrication(Uint8Array): baselined when the gate widened to value casts; burn-down item 906.
    const row = await h.service.install({ caller, bundle: bundle as Uint8Array, grant: [] });
    expect(row.slug).toBe(slug);
    ids.push(row.id);
  }
  expect(ids).toHaveLength(SHOWCASE_PLUGIN_SLUGS.length);
});

/** THE FRESH-BOOT CONSENT ASK, END TO END (#1041 / #924 item 2). The nine examples land installed, disabled
 *  and ungranted — and BEFORE this row, nothing ever told the person. This is the receipt that the seeder's
 *  own pass now leaves exactly ONE durable inbox row saying how many plugins are waiting, addressed to the
 *  principal that OWNS them.
 *
 *  It is the join of the two halves pinned separately (`domain/plugin/substrate/consent-prompt.int.test.ts`
 *  decides the move; `domain/notifications/verbs/standing.int.test.ts` pins what each move does): here the
 *  REAL plugin verbs drive the REAL notifications service over the REAL packed bundles.
 *
 *  THE COUNT IS THE POINT, and it is why the ops are wired rather than recorded: the seeder installs all nine
 *  slugs CONCURRENTLY, so nine consent raises each finish and then ask "how many are pending now?". Without
 *  the producer's per-recipient serialisation the surviving row carries whichever count raced last, and a
 *  fresh boot could greet its owner with "7 plugins are waiting" while nine wait. RED-FIRST RECEIPT
 *  (2026-09-05, `git show HEAD:` sources): `items` was EMPTY. */
test("the seeder leaves the owner ONE durable ask that counts every waiting plugin", async () => {
  const db = await freshDb();
  const notifications = createNotificationsService({ db, now: (): number => FROZEN_AT_MS, resolveStandingAsks: createResolveStandingAsks(db) });
  const inert = makeInertOps();
  const ops: PluginHostOps = {
    ...inert,
    notifications: {
      ...inert.notifications,
      // The compose bodies, minus the transport publish (`entry/compose/automation-plugin.ts`).
      emitStanding: async (event): Promise<void> => {
        await notifications.record({ event, supersedeActiveOfSameType: true });
      },
      refreshStanding: async (event): Promise<void> => {
        await notifications.refreshStanding({ event });
      },
      retractStanding: async (req): Promise<void> => {
        await notifications.retract(req);
      },
    },
  };
  const h = makePluginHarness(db, { port: realHost(), ops });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  const latch: SeedLatch = { seeded: false, versions: {} };

  const seeder = createExamplePluginSeeder(seederDeps(h, latch));

  await seeder.ensureSeeded(caller);

  const inbox = await notifications.list({ principal: caller });
  expect(inbox.items).toHaveLength(1);
  expect(inbox.items[0]?.payload).toEqual({
    type: "plugins-awaiting-consent",
    recipientUserId: caller.userId,
    pendingCount: SHOWCASE_PLUGIN_SLUGS.length,
  });
  // Unread: the whole point is that it reaches the bell as something new.
  expect(inbox.items[0]?.readAt).toBeNull();

  // ANSWERING ONE DOES NOT RE-ASK: the standing row's number drops in place, same row, still one row.
  const [firstRow] = await h.service.list({ caller });
  await h.service.setGrant({
    caller,
    pluginId: firstRow?.id as PluginId,
    grant: firstRow?.declaredCapabilities ?? [],
    acknowledgedNetHosts: firstRow?.netHosts ?? [],
  });
  const after = await notifications.list({ principal: caller });
  expect(after.items).toHaveLength(1);
  expect(after.items[0]?.id).toBe(inbox.items[0]?.id);
  expect(after.items[0]?.payload).toEqual({
    type: "plugins-awaiting-consent",
    recipientUserId: caller.userId,
    pendingCount: SHOWCASE_PLUGIN_SLUGS.length - 1,
  });
});

// ────────────────────────────────────────────────────────────────────────────────────────────────────
// #803 — THE AUTO-UPGRADE (owner-ruled 2026-09-05, arm (a)). The four arms of one decision, each with the
// state that decides it. Before this, `examplePluginsSeeded` gated the WHOLE pass, so an improved bundle
// (card-atlas 1.0.0 → 1.1.0) reached only a FRESH database and every existing install stayed on the old
// version until someone dropped their db. The upgrade half now runs on every pass and touches a row only
// when it is still exactly what this system last wrote.
//
// "The next boot" is a SECOND SEEDER INSTANCE over the SAME latch object, deliberately: the in-process memo
// makes a repeat `ensureSeeded` on one instance a no-op by design, so re-running through the same instance
// would prove nothing about the persisted state.
// ────────────────────────────────────────────────────────────────────────────────────────────────────

/** The slug these four use: Tier-S (no `ui.js`), so a forged bundle stays a two-entry zip. */
const UPGRADE_SLUG = "draft-polish";

async function seedOnce(h: ReturnType<typeof makePluginHarness>, latch: SeedLatch, caller: Principal): Promise<void> {
  await createExamplePluginSeeder(seederDeps(h, latch)).ensureSeeded(caller);
}

type ListedPlugin = Awaited<ReturnType<ReturnType<typeof makePluginHarness>["service"]["list"]>>[number];

/** One slug's row out of a `plugin.list` read, or `undefined` when the caller does not hold it — which is
 *  itself an assertion subject here (the deleted arm). */
function rowFor(rows: readonly ListedPlugin[], slug: string): ListedPlugin | undefined {
  return rows.find((row) => row.slug === slug);
}

test("#803 a NEWER bundle reaches a PRISTINE seeded install — same row, upgraded in place", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db, { port: realHost(), ops: makeInertOps() });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  const latch: SeedLatch = { seeded: false, versions: {} };

  await seedOnce(h, latch, caller);
  const before = rowFor(await h.service.list({ caller }), UPGRADE_SLUG);
  expect(before).toBeDefined();
  // The install half recorded OUR provenance — that record is what makes the row recognisable as ours later.
  expect(latch.versions[UPGRADE_SLUG]).toBe(before?.version);

  // The next release of that showcase plugin.
  const shipped = "9.9.9";
  const nextBoot = createExamplePluginSeeder(
    seederDeps(h, latch, {
      packBundle: async (slug) => (slug === UPGRADE_SLUG ? await bundleAtVersion(slug, shipped) : await packShowcaseBundle(slug)),
      bundledVersion: async (slug): Promise<string | null> => (slug === UPGRADE_SLUG ? shipped : ((await readShowcaseManifest(slug))?.version ?? null)),
    }),
  );
  await nextBoot.ensureSeeded(caller);

  const after = rowFor(await h.service.list({ caller }), UPGRADE_SLUG);
  expect(after?.version).toBe(shipped);
  // The SAME row, not a re-install: the plugin id is the FK every `plugin_kv` key and surface state hangs
  // off, so a new id would silently orphan everything the user's copy had accumulated.
  expect(after?.id).toBe(before?.id);
  // The consent posture survives the upgrade untouched — still nothing granted, still off.
  expect(after?.grantedCapabilities).toEqual([]);
  expect(after?.status).toBe("disabled");
  // …and the provenance advanced, so the NEXT release compares against what we actually wrote.
  expect(latch.versions[UPGRADE_SLUG]).toBe(shipped);
});

test("#803 a DIVERGED install is left alone — the user has taken the plugin over", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db, { port: realHost(), ops: makeInertOps() });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  const latch: SeedLatch = { seeded: false, versions: {} };

  await seedOnce(h, latch, caller);
  const seeded = rowFor(await h.service.list({ caller }), UPGRADE_SLUG);
  // The user replaces it with their own build, through the real upgrade verb — the row moves to a version
  // this system never wrote, which is the plugin domain's own divergence oracle
  // (`verbs/uninstall-for-all-users.ts`: a `version-diverged` row is one its owner has taken over).
  // @orb-waive no-test-fabrication(PluginId): baselined when the gate widened to value casts; burn-down item 906.
  await h.service.upgrade({ caller, pluginId: seeded?.id as PluginId, bundle: await bundleAtVersion(UPGRADE_SLUG, "5.0.0") });
  expect(rowFor(await h.service.list({ caller }), UPGRADE_SLUG)?.version).toBe("5.0.0");

  const shipped = "9.9.9";
  await createExamplePluginSeeder(
    seederDeps(h, latch, {
      packBundle: async (slug) => (slug === UPGRADE_SLUG ? await bundleAtVersion(slug, shipped) : await packShowcaseBundle(slug)),
      bundledVersion: async (slug): Promise<string | null> => (slug === UPGRADE_SLUG ? shipped : ((await readShowcaseManifest(slug))?.version ?? null)),
    }),
  ).ensureSeeded(caller);

  // Untouched: their fork stands, and our provenance record still names what WE last wrote.
  expect(rowFor(await h.service.list({ caller }), UPGRADE_SLUG)?.version).toBe("5.0.0");
  expect(latch.versions[UPGRADE_SLUG]).toBe(seeded?.version);
});

test("#803 a DELETED seeded plugin stays deleted, even when a newer bundle ships", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db, { port: realHost(), ops: makeInertOps() });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  const latch: SeedLatch = { seeded: false, versions: {} };

  await seedOnce(h, latch, caller);
  const seeded = rowFor(await h.service.list({ caller }), UPGRADE_SLUG);
  // @orb-waive no-test-fabrication(PluginId): baselined when the gate widened to value casts; burn-down item 906.
  await h.service.uninstall({ caller, pluginId: seeded?.id as PluginId });

  const shipped = "9.9.9";
  await createExamplePluginSeeder(
    seederDeps(h, latch, {
      packBundle: async (slug) => (slug === UPGRADE_SLUG ? await bundleAtVersion(slug, shipped) : await packShowcaseBundle(slug)),
      bundledVersion: async (slug): Promise<string | null> => (slug === UPGRADE_SLUG ? shipped : ((await readShowcaseManifest(slug))?.version ?? null)),
    }),
  ).ensureSeeded(caller);

  // DELETION-RESPECT is not a second rule in the upgrade half — a row the user removed is simply not in the
  // held set, so there is nothing to upgrade and the latch still forbids re-installing it.
  expect(rowFor(await h.service.list({ caller }), UPGRADE_SLUG)).toBeUndefined();
});

test("#803 a settled boot at EQUAL versions writes nothing at all", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db, { port: realHost(), ops: makeInertOps() });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  const latch: SeedLatch = { seeded: false, versions: {} };

  await seedOnce(h, latch, caller);
  const first = await h.service.list({ caller });
  const recorded = { ...latch.versions };

  // The next boot on the SAME shipped bundles: no install (latched), no upgrade (nothing is newer), and —
  // the part a version compare alone would not give — no settings write either.
  const writes: number[] = [];
  await createExamplePluginSeeder(
    seederDeps(h, latch, {
      writeSeededVersions: (): Promise<void> => {
        writes.push(1);
        return Promise.resolve();
      },
    }),
  ).ensureSeeded(caller);

  expect(writes).toHaveLength(0);
  expect(latch.versions).toEqual(recorded);
  const second = await h.service.list({ caller });
  expect(second.map((row) => `${row.slug}@${row.version}`).sort()).toEqual(first.map((row) => `${row.slug}@${row.version}`).sort());
  expect(second.map((row) => row.updatedAt)).toEqual(first.map((row) => row.updatedAt));
});

test("an enabled older install upgrades to the release-built bundle and the new guest deals on from its stored session", async () => {
  const db = await freshDb();
  const { ops, captured } = recordingOps(db, new Map());
  const h = makePluginHarness(db, {
    port: realHost(),
    ops,
    showcase: {
      slugs: new Set(SHOWCASE_PLUGIN_SLUGS),
      bundle: packShowcaseBundle,
      version: async (slug): Promise<string | null> => (await readShowcaseManifest(slug))?.version ?? null,
    },
  });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  const shipped = (await readShowcaseManifest("oracle-deck"))?.version;
  // The whole declared set: an upgrade re-activates an enabled row only when no declared capability is unanswered.
  const grant: PluginCapability[] = ["storage.kv", "tools.register", "ui.surface", "chat.transform", "plugin_events"];
  // The older release labels its draws differently, so each draw names the guest code that dealt it.
  const olderGuest = (mainJs: string): string => mainJs.replace("`${taken.length} cards`", "`${taken.length} cards (older release)`");
  const installed = await h.service.install({ caller, bundle: await bundleAtVersion("oracle-deck", "0.0.1", olderGuest), grant: [] });
  await h.service.setGrant({ caller, pluginId: installed.id, grant, acknowledgedNetHosts: [] });
  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });
  // @orb-waive no-test-fabrication({): baselined when the gate widened to value casts; burn-down item 906.
  const before = JSON.parse(await requireInvoke(captured)(requireHandler(captured.tools, 0, "tool"), JSON.stringify({ count: 2 }), null)) as {
    dealt: number;
    countLabel: string;
  };
  expect(before).toMatchObject({ dealt: 2, countLabel: "2 cards (older release)" });

  const upgraded = await h.service.upgradeFromShowcase({ caller, pluginId: installed.id });

  expect(upgraded.version).toBe(shipped);
  expect(upgraded.status).toBe("enabled");
  expect(upgraded.grantedCapabilities).toEqual(grant);
  // The upgrade re-activated the release-built guest, which registered its own `draw` a second time.
  const draws = captured.tools.filter((tool) => tool.name === "draw");
  expect(draws).toHaveLength(2);
  const draw = requireHandler(draws, 1, "draw tool");
  const after = JSON.parse(await requireInvoke(captured)(draw, JSON.stringify({ count: 2 }), null)) as { dealt: number; countLabel: string };
  expect(after).toMatchObject({ dealt: 4, countLabel: "2 cards" });
});

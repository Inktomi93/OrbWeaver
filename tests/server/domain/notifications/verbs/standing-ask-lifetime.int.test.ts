// @subject packages/server/src/domain/notifications/verbs/standing.ts
// @subject packages/server/src/domain/notifications/persistence/queries.ts
// @subject packages/server/src/domain/plugin/substrate/consent-prompt.ts
// @subject tests/support/node/factories/plugin.ts

import { spawn } from "node:child_process";
import process from "node:process";
import type { Principal } from "@orb/contracts/identity";
import type { InboxView } from "@orb/contracts/notifications";
import type { PluginManifest } from "@orb/contracts/plugin";
import { PLUGIN_MAIN_ENTRY, PLUGIN_MANIFEST_ENTRY } from "@orb/contracts/plugin";
import { MS_PER_SECOND } from "@orb/kit/time";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { makePluginBundle, PLUGIN_ZIP_MTIME_SECONDS_RANGE } from "@orb/testkit/node/composed";
import { unzipSync } from "fflate";
import { describe } from "vitest";
import { expect, NOTIFICATION_GUEST_SOURCE, pendingConsent, test } from "../_fixtures.ts";

const CONSENT_TYPE = "plugins-awaiting-consent";
async function standingRows(harness: ServerTestHarness, principal: Principal): Promise<readonly InboxView[]> {
  const page = await harness.services.notifications.list({ principal });
  return page.items.filter((item) => item.type === CONSENT_TYPE);
}
describe("record — supersedeActiveOfSameType", () => {
  test("a re-raise leaves ONE live row of the type, carrying the newest number", async ({ harness, notificationActors: actors, consentSnapshots: consent }) => {
    const svc = harness.services.notifications;
    await svc.record({ event: consent.small, supersedeActiveOfSameType: true });
    await svc.record({ event: consent.large, supersedeActiveOfSameType: true });

    const rows = await standingRows(harness, actors.alice);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.payload).toEqual(consent.large);
  });

  test("it supersedes only the SAME type, and only the SAME recipient", async ({ harness, notificationActors: actors, consentSnapshots: consent }) => {
    const svc = harness.services.notifications;
    await svc.record({ event: actors.aliceInvite });
    await svc.record({ event: consent.bob, supersedeActiveOfSameType: true });
    await svc.record({ event: consent.corrected, supersedeActiveOfSameType: true });
    await svc.record({ event: consent.large, supersedeActiveOfSameType: true });

    const alice = await svc.list({ principal: actors.alice });
    expect(alice.items.map((item) => item.type).sort()).toEqual(["invite", CONSENT_TYPE].sort());
    expect((await standingRows(harness, actors.bob))[0]?.payload).toEqual(consent.bob);
  });

  test("the absent flag still APPENDS — two invites are two events", async ({ harness, notificationActors: actors }) => {
    const svc = harness.services.notifications;
    await svc.record({ event: actors.aliceInvite });
    await svc.record({ event: actors.aliceInvite });
    expect((await svc.list({ principal: actors.alice })).items).toHaveLength(2);
  });
});

describe("refreshStanding — the QUIET correction", () => {
  test("the number changes in place: same row, same seq, and a row already read STAYS read", async ({
    harness,
    notificationActors: actors,
    consentSnapshots: consent,
  }) => {
    const svc = harness.services.notifications;
    const raised = await svc.record({ event: consent.large, supersedeActiveOfSameType: true });
    await svc.markAllRead({ principal: actors.alice });

    const changed = await svc.refreshStanding({ event: consent.corrected });
    expect(changed).toHaveLength(1);

    const rows = await standingRows(harness, actors.alice);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.payload).toEqual(consent.corrected);
    expect(rows[0]?.seq).toBe(raised.seq);
    expect(rows[0]?.readAt).not.toBeNull();
  });

  test("it does NOT resurrect a dismissed ask — no active row means no write", async ({ harness, notificationActors: actors, consentSnapshots: consent }) => {
    const svc = harness.services.notifications;
    const raised = await svc.record({ event: consent.large, supersedeActiveOfSameType: true });
    await svc.dismiss({ principal: actors.alice, notificationId: raised.id });

    expect(await svc.refreshStanding({ event: consent.corrected })).toHaveLength(0);
    expect(await standingRows(harness, actors.alice)).toHaveLength(0);
  });

  test("it touches only the addressed recipient's row", async ({ harness, notificationActors: actors, consentSnapshots: consent }) => {
    const svc = harness.services.notifications;
    await svc.record({ event: consent.large, supersedeActiveOfSameType: true });
    await svc.record({ event: consent.bob, supersedeActiveOfSameType: true });

    await svc.refreshStanding({ event: consent.corrected });

    expect((await standingRows(harness, actors.bob))[0]?.payload).toEqual(consent.bob);
  });
});

describe("retract — the ask is gone", () => {
  test("it takes the standing row out of the active inbox and returns what it flipped", async ({
    harness,
    notificationActors: actors,
    clock,
    consentSnapshots: consent,
  }) => {
    const svc = harness.services.notifications;
    await svc.record({ event: consent.corrected, supersedeActiveOfSameType: true });
    await svc.record({ event: actors.aliceInvite });

    const withdrawn = await svc.retract({ recipientUserId: actors.alice.userId, type: CONSENT_TYPE });
    expect(withdrawn).toHaveLength(1);
    expect(withdrawn[0]?.dismissedAt).toBe(clock.frozenAt);

    const page = await svc.list({ principal: actors.alice });
    expect(page.items.map((item) => item.type)).toEqual(["invite"]);
  });

  test("it is idempotent and total — retracting when nothing stands flips nothing", async ({
    harness,
    notificationActors: actors,
    consentSnapshots: consent,
  }) => {
    const svc = harness.services.notifications;
    expect(await svc.retract({ recipientUserId: actors.alice.userId, type: CONSENT_TYPE })).toHaveLength(0);
    await svc.record({ event: consent.corrected, supersedeActiveOfSameType: true });
    expect(await svc.retract({ recipientUserId: actors.alice.userId, type: CONSENT_TYPE })).toHaveLength(1);
    expect(await svc.retract({ recipientUserId: actors.alice.userId, type: CONSENT_TYPE })).toHaveLength(0);
  });

  test("a retracted row never replays on a socket resume (#1459's ascending pump reads active rows only)", async ({
    harness,
    notificationActors: actors,
    consentSnapshots: consent,
  }) => {
    const svc = harness.services.notifications;
    const raised = await svc.record({ event: consent.large, supersedeActiveOfSameType: true });
    await svc.retract({ recipientUserId: actors.alice.userId, type: CONSENT_TYPE });

    expect(await svc.replaySince({ principal: actors.alice, afterSeq: raised.seq - 1 })).toHaveLength(0);
  });

  test("a SUPERSEDED row never replays either — a resume cannot show two copies of one ask", async ({
    harness,
    notificationActors: actors,
    consentSnapshots: consent,
  }) => {
    const svc = harness.services.notifications;
    const first = await svc.record({ event: consent.small, supersedeActiveOfSameType: true });
    const second = await svc.record({ event: consent.large, supersedeActiveOfSameType: true });

    const replayed = await svc.replaySince({ principal: actors.alice, afterSeq: first.seq - 1 });
    expect(replayed.map((view) => view.seq)).toEqual([second.seq]);
  });
});

const CHILD_TIMEZONE_ENV = "TZ";

// One child per timezone builds every mtime: a child pays the whole testkit module load, so a child per (mtime, timezone) pair quadrupled it.
async function archivesInTimezone(manifest: PluginManifest, mtimes: readonly number[], timezone: string): Promise<readonly string[]> {
  await using lifetime = new AsyncDisposableStack();
  const source = `import { makePluginBundle } from "@orb/testkit/node/composed";
const archives = ${JSON.stringify(mtimes)}.map((mtime) => Buffer.from(makePluginBundle(${JSON.stringify(manifest)}, ${JSON.stringify(NOTIFICATION_GUEST_SOURCE)}, mtime)).toString("base64"));
process.stdout.write(JSON.stringify(archives));`;
  const child = spawn(process.execPath, ["--input-type=module", "--eval", source], {
    env: { [CHILD_TIMEZONE_ENV]: timezone },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const closed = Promise.withResolvers<void>();
  const completion = Promise.withResolvers<number | null>();
  child.once("error", completion.reject);
  child.once("close", (exitCode) => {
    closed.resolve();
    completion.resolve(exitCode);
  });
  lifetime.defer(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
    }
    await closed.promise;
  });
  let bytes = "";
  let diagnostic = "";
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
    bytes += chunk;
  });
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
    diagnostic += chunk;
  });
  const code = await completion.promise;
  if (code !== 0) {
    throw new Error(`native ZIP child failed: ${diagnostic}`);
  }
  return JSON.parse(bytes) as string[];
}

test("the same raw plugin input has exact native ZIP bytes across UTC and Boise including a DST-boundary epoch", async ({
  harness,
  notificationActors: actors,
  clock,
}) => {
  const pending = await pendingConsent(harness, actors.alice);
  const mtimes = [clock.now(), Date.UTC(2025, 2, 9, 9, 30)];
  const [utc, boise] = await Promise.all([archivesInTimezone(pending.manifest, mtimes, "UTC"), archivesInTimezone(pending.manifest, mtimes, "America/Boise")]);
  expect(utc).toHaveLength(mtimes.length);
  expect(boise).toEqual(utc);
});

test("raw plugin UTC mtime admits signed32 endpoints and refuses unrepresentable seconds instead of wrapping", async ({
  harness,
  notificationActors: actors,
}) => {
  const pending = await pendingConsent(harness, actors.alice);
  for (const seconds of PLUGIN_ZIP_MTIME_SECONDS_RANGE) {
    const archive = makePluginBundle(pending.manifest, NOTIFICATION_GUEST_SOURCE, seconds * MS_PER_SECOND);
    expect(Object.keys(unzipSync(archive)).toSorted()).toEqual([PLUGIN_MANIFEST_ENTRY, PLUGIN_MAIN_ENTRY].toSorted());
  }
  const [min, max] = PLUGIN_ZIP_MTIME_SECONDS_RANGE;
  for (const mtime of [(min - 1) * MS_PER_SECOND, (max + 1) * MS_PER_SECOND, Number.NaN]) {
    expect(() => makePluginBundle(pending.manifest, NOTIFICATION_GUEST_SOURCE, mtime)).toThrow(RangeError);
  }
});

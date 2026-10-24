// @subject packages/server/src/entry/compose/services.ts
// The harness root's seeded nonce, not an ambient UUID, names the supervised work the composed graph starts.
import { readdir } from "node:fs/promises";
import { CSRF_HEADER } from "@orb/contracts/identity";
import { importStartedSchema } from "@orb/contracts/import";
import { streamConnectInputSchema } from "@orb/contracts/stream";
import { ID_PREFIX } from "@orb/kit/ids";
import { stagedOwnerRoot } from "@orb/server/domain/import";
import { recentTraces } from "@orb/server/foundation/observability";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";

// Every trace the ring still holds; the test filters to the names its own act started.
const TRACE_WINDOW = 10_000;
// The seeded `uuid` keeps its counter in the low 32 bits of a fixed v4 shape.
const SEEDED_UUID = "00000000-0000-4000-8000-0000([0-9a-f]{8})";
// A supervised name ends in `:<nonce>`.
const SEEDED_NONCE = new RegExp(`:${SEEDED_UUID}$`, "u");
const SEEDED_BUNDLE_TOKEN = new RegExp(`^import-bundle-${SEEDED_UUID}\\.zip$`, "u");
const HEX_RADIX = 16;
const BUNDLE_ROUTE = "/api/import/bundle";

function traceIds(): ReadonlySet<string> {
  return new Set(recentTraces(TRACE_WINDOW).map((entry) => entry.requestId));
}

/** The seeded counter behind each new supervised name under `prefix`; `null` marks a nonce of any other shape. */
function startedCounters(before: ReadonlySet<string>, prefix: string): readonly (number | null)[] {
  return [...traceIds()]
    .filter((requestId) => requestId.startsWith(prefix) && !before.has(requestId))
    .map((requestId) => {
      const counter = SEEDED_NONCE.exec(requestId)?.[1];
      return counter === undefined ? null : Number.parseInt(counter, HEX_RADIX);
    });
}

/** Whether a counter was minted by the harness ids inside the act's window `(after, through]`. */
function mintedWithin(after: number, through: number): (counter: number | null) => boolean {
  return (counter) => counter !== null && counter > after && counter <= through;
}

test("a domain event's bus dispatch and automation watcher name their supervised work with the root's seeded nonce", async ({ harness }) => {
  const before = traceIds();
  const minted = harness.ids.snapshot();
  harness.app.eventBus.emit({ type: "character.updated", characterId: harness.idSource.typeId(ID_PREFIX.character), contentChanged: false });
  await harness.settleBackground();
  const inWindow = mintedWithin(minted, harness.ids.snapshot());
  for (const prefix of ["domain-event:character.updated:", "automation:domain:character.updated:"]) {
    const counters = startedCounters(before, prefix);
    expect(counters.length, prefix).toBeGreaterThan(0);
    expect(
      counters.filter((counter) => !inWindow(counter)),
      prefix,
    ).toEqual([]);
  }
});

test("a stream socket's room pump is supervised under the root's seeded nonce", async ({ harness, ownerCaller }) => {
  const room = (await ownerCaller.chat.startChat({ characterIds: [] })).chat;
  const { socketId } = streamConnectInputSchema.parse({ socketId: harness.ids.uuid() });
  const prefix = `stream-room:${socketId}:`;
  const before = traceIds();
  const frames = (await ownerCaller.stream.connect({ socketId }))[Symbol.asyncIterator]();
  try {
    expect((await frames.next()).done).toBe(false);
    const minted = harness.ids.snapshot();
    await ownerCaller.stream.attach({ socketId, ref: { channel: "chat", chatId: room.id }, sinceSeq: null });
    await ownerCaller.stream.detach({ socketId, ref: { channel: "chat", chatId: room.id } });
    await expect.poll(() => startedCounters(before, prefix)).toHaveLength(1);
    expect(startedCounters(before, prefix).every(mintedWithin(minted, harness.ids.snapshot()))).toBe(true);
  } finally {
    await frames.return?.();
  }
});

test("a staged bundle upload is named with the root's seeded nonce", async () => {
  await using root = await createServerHarness({
    physicalPeer: () => "127.0.0.1",
    startJobs: false,
    env: { ["AUTH_MODE"]: "local", ["AUTH_FALLBACK"]: "owner" },
  });
  const minted = root.ids.snapshot();
  const response = await root.http.request(BUNDLE_ROUTE, { method: "POST", headers: { [CSRF_HEADER]: "1" }, body: new Uint8Array([1]) });
  expect(response.status).toBe(202);
  const { workloadId } = importStartedSchema.parse(await response.json());
  const workload = await root.services.workloads.get({ id: workloadId, caller: await root.principalFor(root.ownerId) });
  if (workload.kind !== "import-bundle" || workload.poison) {
    throw new Error("the bundle upload left no typed import-bundle workload");
  }
  const counter = SEEDED_BUNDLE_TOKEN.exec(workload.params.token)?.[1];
  expect(mintedWithin(minted, root.ids.snapshot())(counter === undefined ? null : Number.parseInt(counter, HEX_RADIX))).toBe(true);
  expect(await readdir(stagedOwnerRoot(root.importStagingDir, root.ownerId))).toEqual([workload.params.token]);
});

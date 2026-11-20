// The upload routes alone mint staged params, so no tRPC caller can name a handle or a digest, and a member who plants
// links in staging gains neither a delete nor a hash oracle. Only the box owner imports the operator's ST_PROFILE_DIR,
// and a stored trigger is judged too: the rows below that a build before D340 could store are written directly.
// @subject packages/contracts/src/workloads/params.ts
// @subject packages/server/src/transport/trpc/routers/workloads.ts
// @subject packages/server/src/domain/import/workload-contributions.ts
// @subject packages/server/src/domain/workloads/substrate/params.ts
// @subject packages/server/src/domain/workloads/engine/runner.ts
// @subject packages/server/src/domain/workloads/engine/schedule-tick.ts

import { createHash } from "node:crypto";
import { lstat, mkdir, rename, symlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { AUTH_FALLBACK_KEY, AUTH_MODE_KEY } from "@orb/contracts/identity";
import { importStartedSchema, ST_SETTINGS_FILE, STAGED_MANIFEST_FILE } from "@orb/contracts/import";
import { PORTABILITY_ROUTES } from "@orb/contracts/portability";
import type { WorkloadMode, wireStartWorkloadEnvelope } from "@orb/contracts/workloads";
import { OPERATOR_TREE_WORKLOAD_KIND, WORKLOAD_RUN_ACCOUNT_NOT_OWNER, WORKLOAD_RUN_ACCOUNT_REFUSAL } from "@orb/contracts/workloads";
import { workloadSchedules, workloads } from "@orb/db";
import type { Handle, UserId, WorkloadId, WorkloadScheduleId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness, WORKLOAD_DEADLINE_MS } from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { signedInMember } from "../../../entry/_auth-roots.ts";
import { CSRF_HEADERS } from "../../../entry/http/_body-limit-inputs.ts";
import type { Files } from "./_st-tree-door.ts";
import { admit, cardPng, chatOf, harness, post, settings, stagedEntries, stagedTree, tableContents } from "./_st-tree-door.ts";

const SECRET = "the-secret-outside-staging";
const ORIGINAL = "the-staged-original";
const ANY_DIGEST = "0".repeat(64);
// Each case boots a composed root and runs a real import, which a loaded runner can stretch past the default budget.
const SLOW = { tags: "slow" } as const;
const DIRECTORY_LINK = "junction";
const CHARACTER_ROWS = z.array(z.looseObject({ ["owner_id"]: z.string(), name: z.string() }));

type Caller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;
type WireStartWorkloadInput = z.infer<typeof wireStartWorkloadEnvelope>;

const sha = (bytes: string): string => createHash("sha256").update(bytes).digest("hex");

const SERVER_OWNED_INPUTS: readonly unknown[] = [
  { kind: "import-st", params: { stagedDir: "operator-data", stagedDigest: ANY_DIGEST } },
  { kind: "import-st", params: { stagedDir: "operator-data" } },
  { kind: "import-st", params: { stagedDigest: ANY_DIGEST } },
  { kind: "import-bundle", params: { token: "x", stagedDigest: ANY_DIGEST } },
  { kind: "import-bundle", params: { token: "x", stagedDigest: ANY_DIGEST, source: "dir" } },
  { kind: "import-bundle", params: {} },
];

/** Send a real procedure an input its type has no spelling for, as a hand-built request does. */
async function sent(procedure: (input: never) => Promise<unknown>, input: unknown): Promise<unknown> {
  const answer: unknown = Reflect.apply(procedure, undefined, [input]);
  return await answer;
}

const PLAIN_RUN = { kind: "reconcile-stats", params: {} } satisfies WireStartWorkloadInput;
const OPERATOR_RUN = { kind: OPERATOR_TREE_WORKLOAD_KIND, params: {} } satisfies WireStartWorkloadInput;

interface WireVerb {
  readonly verb: string;
  readonly call: (trpc: Caller, input: unknown) => Promise<unknown>;
}

const WIRE_VERBS: readonly WireVerb[] = [
  { verb: "start", call: (trpc, input) => sent(trpc.workloads.start, { input, mode: "singular" }) },
  { verb: "createSchedule", call: (trpc, input) => sent(trpc.workloads.createSchedule, { input, cadence: "hourly", mode: "singular" }) },
  {
    verb: "updateSchedule",
    call: async (trpc, input) => {
      const { id } = await trpc.workloads.createSchedule({ input: PLAIN_RUN, cadence: "weekly", mode: "singular" });
      return await sent(trpc.workloads.updateSchedule, { id, input });
    },
  },
  { verb: "estimateModelCalls", call: (trpc, input) => sent(trpc.workloads.estimateModelCalls, { input, mode: "singular" }) },
];

async function writeTree(dir: string, files: Files): Promise<void> {
  for (const [path, bytes] of Object.entries(files)) {
    await mkdir(dirname(join(dir, path)), { recursive: true });
    await writeFile(join(dir, path), bytes);
  }
}

async function exists(path: string): Promise<boolean> {
  return await lstat(path).then(
    () => true,
    () => false,
  );
}

function outsideOf(root: ServerTestHarness): string {
  return join(root.importStagingDir, "..", "outside-staging");
}

async function member(root: ServerTestHarness): Promise<{ readonly id: UserId; readonly trpc: Caller }> {
  const { id } = await root.actor();
  return { id, trpc: await root.internalCallerFor(id) };
}

async function run(
  root: ServerTestHarness,
  id: WorkloadId,
  reader: UserId = root.ownerId,
): Promise<{ readonly status: string; readonly error: string | null }> {
  if (root.runAdmittedWorkload === undefined) {
    throw new Error("the harness owns workload execution only with startJobs: false");
  }
  await root.runAdmittedWorkload(id, AbortSignal.timeout(WORKLOAD_DEADLINE_MS));
  const row = await root.services.workloads.get({ caller: await root.principalFor(reader), id });
  return { status: row.status, error: row.error ?? null };
}

function profile(root: ServerTestHarness, text: string): Files {
  return { [ST_SETTINGS_FILE]: settings({}), "characters/Aria.png": cardPng(root, "Aria"), "chats/Aria/first.jsonl": chatOf(`${text}-solo`) };
}

async function plantOperatorTree(root: ServerTestHarness): Promise<void> {
  const dir = root.env.ST_PROFILE_DIR;
  if (dir === undefined) {
    throw new Error("the harness composes no ST_PROFILE_DIR");
  }
  await writeTree(join(dir, "default-user"), profile(root, SECRET));
}

async function ownedCharacters(root: ServerTestHarness, ownerId: UserId): Promise<readonly string[]> {
  const rows = CHARACTER_ROWS.parse((await tableContents(root))["characters"]);
  return rows.filter((row) => row["owner_id"] === ownerId).map((row) => row.name);
}

/** A bare schedule the owner stores, then hands to `holder` already due: what a build before D340 stored for a member. */
async function dueSchedule(root: ServerTestHarness, holder: UserId): Promise<WorkloadScheduleId> {
  const owner = await root.internalCallerFor(root.ownerId);
  const { id } = await owner.workloads.createSchedule({ input: OPERATOR_RUN, cadence: "hourly", mode: "singular" });
  await root.db.update(workloadSchedules).set({ ownerId: holder, nextRunAt: 0 }).where(eq(workloadSchedules.id, id));
  return id;
}

/** The two ways a queued upload ends: its run reads it, or a cancel frees it. Both reach the contained rm. */
const ENDINGS: readonly { readonly ending: string; readonly end: (root: ServerTestHarness, id: WorkloadId) => Promise<string | null> }[] = [
  { ending: "run", end: async (root, id) => (await run(root, id)).status },
  {
    ending: "cancel",
    end: async (root, id) => (await root.services.workloads.cancel({ caller: await root.principalFor(root.ownerId), id })).status,
  },
];

test.for(WIRE_VERBS)("$verb refuses every server-owned param from any caller and stores nothing", SLOW, async ({ call }) => {
  await using root = await harness();
  const owner = await root.internalCallerFor(root.ownerId);
  const { trpc } = await member(root);
  for (const caller of [owner, trpc]) {
    for (const input of SERVER_OWNED_INPUTS) {
      await expect(call(caller, input)).toThrowTRPCError("BAD_REQUEST");
    }
    expect(await call(caller, PLAIN_RUN)).toBeDefined();
    expect((await caller.workloads.list()).filter((row) => row.kind.startsWith("import"))).toEqual([]);
    expect((await caller.workloads.listSchedules()).filter((row) => row.kind.startsWith("import"))).toEqual([]);
  }
});

test.for(["run", "cancel"])("with the owner folder linked, a member's chosen stagedDir reaches no entry outside staging (%s)", SLOW, async (how) => {
  await using root = await harness();
  const { id, trpc } = await member(root);
  const stagedRoot = root.stagedImportsOf(id);
  const outside = outsideOf(root);
  await writeTree(outside, { "operator-data/keep-me.db": "precious", "sibling.txt": "stays" });
  await mkdir(dirname(stagedRoot), { recursive: true });
  await symlink(outside, stagedRoot, DIRECTORY_LINK);

  const started = sent(trpc.workloads.start, {
    input: { kind: "import-st", params: { stagedDir: "operator-data", stagedDigest: ANY_DIGEST } },
    mode: "singular",
    scheduledAt: root.clock.now() + (how === "cancel" ? 1_000_000 : 0),
  });

  await expect(started).toThrowTRPCError("BAD_REQUEST");
  expect(await exists(join(outside, "operator-data", "keep-me.db"))).toBe(true);
  expect(await trpc.workloads.list()).toEqual([]);
});

test("a planted manifest behind a planted link answers no question about an outside file", SLOW, async () => {
  await using root = await harness();
  const { id, trpc } = await member(root);
  const outside = outsideOf(root);
  const secret = chatOf(`${SECRET}-solo`);
  await writeTree(outside, { "first.jsonl": secret });
  const dir = join(root.stagedImportsOf(id), "planted");
  await writeTree(dir, { "profile/settings.json": settings({}) });
  await mkdir(join(dir, "profile", "chats"), { recursive: true });
  await symlink(outside, join(dir, "profile", "chats", "Aria"), DIRECTORY_LINK);
  const body = JSON.stringify([
    { path: "profile/settings.json", size: settings({}).length, sha256: sha(settings({})) },
    { path: "profile/chats/Aria/first.jsonl", size: Buffer.byteLength(secret), sha256: sha(secret) },
  ]);
  await writeFile(join(dir, STAGED_MANIFEST_FILE), body);

  const input = { kind: "import-st", params: { stagedDir: "planted", stagedDigest: sha(body) } };
  await expect(sent(trpc.workloads.start, { input, mode: "singular" })).toThrowTRPCError("BAD_REQUEST");

  expect(JSON.stringify(await tableContents(root))).not.toContain(SECRET);
});

test.for(ENDINGS)("a real upload whose owner folder became a link deletes nothing behind the link ($ending)", SLOW, async ({ end }) => {
  await using root = await harness();
  const id = await admit(root, profile(root, ORIGINAL));
  const staged = await stagedTree(root);
  const owner = dirname(staged);
  const outside = outsideOf(root);
  await writeTree(join(outside, basename(staged)), { "keep-me.db": "precious" });
  await rename(owner, `${owner}-aside`);
  await symlink(outside, owner, DIRECTORY_LINK);

  expect(["failed", "cancelled"]).toContain(await end(root, id));

  expect(await exists(join(outside, basename(staged), "keep-me.db"))).toBe(true);
});

test("a retry clones the params the route minted, and they stay out of the wire's reach", SLOW, async () => {
  await using root = await harness();
  const trpc = await root.internalCallerFor(root.ownerId);
  const first = await admit(root, profile(root, ORIGINAL));
  await trpc.workloads.cancel({ id: first });

  const clone = await trpc.workloads.retry({ id: first });

  const [original, retried] = [await trpc.workloads.get({ id: first }), await trpc.workloads.get({ id: clone.id })];
  expect(retried.params).toEqual(original.params);
  expect(retried.params).toMatchObject({ stagedDigest: expect.stringMatching(/^[0-9a-f]{64}$/u) });
});

test("a member's start of import-st is refused and the owner's imports the operator's tree", SLOW, async () => {
  await using root = await harness();
  await plantOperatorTree(root);
  const { id, trpc } = await member(root);

  await expect(trpc.workloads.start({ input: { kind: "import-st", params: {} }, mode: "singular" })).toThrowTRPCError("FORBIDDEN");

  expect(await trpc.workloads.list()).toEqual([]);
  expect(await ownedCharacters(root, id)).toEqual([]);
  expect(JSON.stringify(await tableContents(root))).not.toContain(SECRET);

  const owner = await root.internalCallerFor(root.ownerId);
  const started = await owner.workloads.start({ input: { kind: "import-st", params: {} }, mode: "singular" });
  expect(await run(root, started.id)).toMatchObject({ status: "succeeded" });
  expect(await ownedCharacters(root, root.ownerId)).toContain("Aria");
  expect(await ownedCharacters(root, id)).toEqual([]);
});

test.for(WIRE_VERBS)("$verb of the operator's tree answers the box owner alone", SLOW, async ({ call }) => {
  await using root = await harness();
  await plantOperatorTree(root);
  const input = { kind: "import-st", params: { dryRun: true } } satisfies WireStartWorkloadInput;
  const { trpc } = await member(root);
  const admin = await root.internalCallerFor((await root.actor({ role: "admin" })).id);

  await expect(call(trpc, input)).toThrowTRPCError("FORBIDDEN");
  await expect(call(admin, input)).toThrowTRPCError("FORBIDDEN");

  expect(await call(await root.internalCallerFor(root.ownerId), input)).toBeDefined();
  expect((await trpc.workloads.listSchedules()).filter((row) => row.kind === input.kind)).toEqual([]);
});

test("a member's retry of a stored bare row is refused, and the owner's retry of its own is not", SLOW, async () => {
  await using root = await harness();
  await plantOperatorTree(root);
  const owner = await root.internalCallerFor(root.ownerId);
  const { id, trpc } = await member(root);
  const held = await owner.workloads.start({ input: { kind: "import-st", params: {} }, mode: "singular" });
  await owner.workloads.cancel({ id: held.id });
  const stored = await owner.workloads.retry({ id: held.id });
  await owner.workloads.cancel({ id: stored.id });
  await root.db.update(workloads).set({ ownerId: id }).where(eq(workloads.id, stored.id));

  await expect(trpc.workloads.retry({ id: stored.id })).toThrowTRPCError("FORBIDDEN");
  await expect(trpc.workloads.estimateRetryModelCalls({ id: stored.id })).toThrowTRPCError("FORBIDDEN");

  expect(await run(root, (await owner.workloads.retry({ id: held.id })).id)).toMatchObject({ status: "succeeded" });
  expect(await ownedCharacters(root, id)).toEqual([]);
});

test("at the tick a member's stored bare schedule enqueues nothing, and the owner's fires and imports", SLOW, async () => {
  await using root = await harness();
  await plantOperatorTree(root);
  const owner = await root.internalCallerFor(root.ownerId);
  const { id, trpc } = await member(root);
  const held = await dueSchedule(root, id);
  await dueSchedule(root, root.ownerId);
  await trpc.workloads.setScheduleEnabled({ id: held, enabled: false });
  await trpc.workloads.setScheduleEnabled({ id: held, enabled: true });

  await root.tickWorkloadSchedules?.();

  expect(await trpc.workloads.list()).toEqual([]);
  // The holder sees why the schedule starts nothing; the owner's own schedule carries no refusal.
  expect((await trpc.workloads.listSchedules()).map(({ id: scheduleId, refusal }) => ({ scheduleId, refusal }))).toEqual([
    { scheduleId: held, refusal: WORKLOAD_RUN_ACCOUNT_NOT_OWNER },
  ]);
  const ownerView = await owner.workloads.listSchedules();
  expect(ownerView.find((row) => row.id === held)?.refusal).toBe(WORKLOAD_RUN_ACCOUNT_NOT_OWNER);
  expect(ownerView.filter((row) => row.id !== held).map((row) => ({ ownerId: row.ownerId, refused: "refusal" in row }))).toEqual([
    { ownerId: root.ownerId, refused: false },
  ]);
  expect((await trpc.workloads.listSchedules()).find((row) => row.id === held)?.nextRunAt).toBeGreaterThan(0);
  const fired = (await owner.workloads.list()).filter((row) => row.kind === OPERATOR_TREE_WORKLOAD_KIND);
  expect(fired.map((row) => row.ownerId)).toEqual([root.ownerId]);
  const [firedRow] = fired;
  if (firedRow === undefined) {
    throw new Error("the owner's schedule fired no row");
  }
  expect(await run(root, firedRow.id)).toMatchObject({ status: "succeeded" });
  expect(await ownedCharacters(root, root.ownerId)).toContain("Aria");
  expect(await ownedCharacters(root, id)).toEqual([]);
});

const MEMBER_HELD_ROWS: readonly { readonly name: string; readonly mode: WorkloadMode; readonly funder: "member" | "owner" | "gone" }[] = [
  { name: "a singular row a member funds", mode: "singular", funder: "member" },
  { name: "a singular row under a member the owner funds", mode: "singular", funder: "owner" },
  { name: "a bulk row a member funds", mode: "bulk", funder: "member" },
  { name: "a bulk row with no funder", mode: "bulk", funder: "gone" },
];

test.for(MEMBER_HELD_ROWS)("$name fails at dispatch and reads nothing of the operator's tree", SLOW, async ({ mode, funder }) => {
  await using root = await harness();
  await plantOperatorTree(root);
  const owner = await root.internalCallerFor(root.ownerId);
  const { id } = await member(root);
  const held = await owner.workloads.start({ input: OPERATOR_RUN, mode: "singular" });
  const funderUserId = { member: id, owner: root.ownerId, gone: null }[funder];
  await root.db.update(workloads).set({ ownerId: id, mode, funderUserId }).where(eq(workloads.id, held.id));

  expect(await run(root, held.id)).toEqual({ status: "failed", error: WORKLOAD_RUN_ACCOUNT_REFUSAL });

  expect(await ownedCharacters(root, id)).toEqual([]);
  expect(JSON.stringify(await tableContents(root))).not.toContain(SECRET);

  const bulk = await owner.workloads.start({ input: OPERATOR_RUN, mode: "bulk", targetOwnerId: id });
  expect(await run(root, bulk.id)).toMatchObject({ status: "succeeded" });
  expect(await ownedCharacters(root, id)).toContain("Aria");
});

test("the owner cannot store a run that would refuse: a member's schedule or bare row stays out of reach", SLOW, async () => {
  await using root = await harness();
  await plantOperatorTree(root);
  const owner = await root.internalCallerFor(root.ownerId);
  const { id, trpc } = await member(root);
  const { id: schedule } = await trpc.workloads.createSchedule({ input: PLAIN_RUN, cadence: "weekly", mode: "singular" });
  const held = await owner.workloads.start({ input: OPERATOR_RUN, mode: "singular" });
  await owner.workloads.cancel({ id: held.id });
  await root.db.update(workloads).set({ ownerId: id }).where(eq(workloads.id, held.id));

  // The owner may ask; the run's account may not run, and the refusal is coded so the owner's toast can say so.
  const accountRefusal = { code: "BAD_REQUEST", cause: expect.objectContaining({ code: WORKLOAD_RUN_ACCOUNT_NOT_OWNER }) };
  await expect(owner.workloads.updateSchedule({ id: schedule, input: OPERATOR_RUN })).rejects.toMatchObject(accountRefusal);
  await expect(owner.workloads.retry({ id: held.id })).rejects.toMatchObject(accountRefusal);
  await expect(owner.workloads.estimateRetryModelCalls({ id: held.id })).rejects.toMatchObject(accountRefusal);

  expect(await owner.workloads.updateSchedule({ id: schedule, input: PLAIN_RUN })).toMatchObject({ kind: PLAIN_RUN.kind });
  const bulk = await owner.workloads.start({ input: OPERATOR_RUN, mode: "bulk", targetOwnerId: id });
  await owner.workloads.cancel({ id: bulk.id });
  const clone = await owner.workloads.retry({ id: bulk.id });
  expect(await run(root, clone.id)).toMatchObject({ status: "succeeded" });
  expect(await ownedCharacters(root, id)).toContain("Aria");
});

test("the owner's bulk run imports the operator's tree into the account it names", SLOW, async () => {
  await using root = await harness();
  await plantOperatorTree(root);
  const { id } = await member(root);
  const owner = await root.internalCallerFor(root.ownerId);

  const started = await owner.workloads.start({ input: { kind: "import-st", params: {} }, mode: "bulk", targetOwnerId: id });

  expect(await run(root, started.id)).toMatchObject({ status: "succeeded" });
  expect(await ownedCharacters(root, id)).toContain("Aria");
});

test("a member's own folder upload still runs through the route, with the operator's tree untouched", SLOW, async () => {
  await using root = await createServerHarness({
    physicalPeer: () => "127.0.0.1",
    startJobs: false,
    env: { [AUTH_MODE_KEY]: "local", [AUTH_FALLBACK_KEY]: "owner" },
  });
  await plantOperatorTree(root);
  const { id, cookie } = await signedInMember(root, castId<Handle>("upload-member"));

  const response = await post(root, profile(root, ORIGINAL), [], { headers: { ...CSRF_HEADERS, cookie } });

  expect(response.status).toBe(202);
  const { workloadId } = importStartedSchema.parse(await response.json());
  expect(await run(root, workloadId, id)).toMatchObject({ status: "succeeded" });
  const rows = JSON.stringify(await tableContents(root));
  expect(rows).toContain(`${ORIGINAL}-solo`);
  expect(rows).not.toContain(SECRET);
  expect(await ownedCharacters(root, id)).toContain("Aria");
  expect(await stagedEntries(root, id)).toEqual([]);
});

test("a bundle upload still answers 202 through its route with the digest the server minted", SLOW, async () => {
  await using root = await harness();

  const response = await root.http.request(PORTABILITY_ROUTES.importBundle, { method: "POST", headers: CSRF_HEADERS, body: new Uint8Array([1, 2, 3]) });

  expect(response.status).toBe(202);
  const { workloadId } = importStartedSchema.parse(await response.json());
  expect(await root.services.workloads.get({ caller: await root.principalFor(root.ownerId), id: workloadId })).toMatchObject({
    kind: "import-bundle",
    params: { stagedDigest: sha("\u0001\u0002\u0003") },
  });
});

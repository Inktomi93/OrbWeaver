// A full pool retires its least recently used runtime to serve a request. When that retirement fails, the failure stays
// with the retired target: the request that needed the slot is served, the target's own next request is refused with
// its failure, and closing the pool reports it. Another plugin's call never carries it.
//
// No owner holds the whole pool (D349): while a second owner can run plugin code, an owner has at most its share of the
// Workers in use, a request past it waits for that owner's own Worker, and a request that cannot proceed never holds
// the ones behind it. A sole owner uses every Worker. Every owner keeps to its share of the request queue.
// @subject packages/server/src/infra/plugin-host/warm-runtime-pool.ts
import { DomainConflictError } from "@orb/kit/errors";
import { expect, test } from "@orb/testkit/node";
import { PLUGIN_RUNTIME_REQUEST_QUEUE_MAX, pluginOwnerShare } from "#server/infra/plugin-host/budgets.ts";
import { WarmRuntimePool } from "#server/infra/plugin-host/warm-runtime-pool.ts";

const ONE_RUNTIME = 1;
const QUEUE_LIMIT = 8;
// The broker's default Worker count.
const WORKERS = 4;

interface Target {
  readonly owner: string;
  readonly plugin: string;
}

const ownerOf = (target: Target): string => target.owner;
// The owners of enabled resident plugins: the member alone, or the member and another owner.
const alone = { ownerOf, residentOwners: (): readonly string[] => ["member"] };
const shared = { ownerOf, residentOwners: (): readonly string[] => ["member", "other"] };
const retired = (): Promise<void> => Promise.resolve();
const targetsOf = (owner: string, count: number): readonly Target[] =>
  Array.from({ length: count }, (_, index) => ({ owner, plugin: `${owner}-${String(index)}` }));

// Whether a request has been granted a Worker yet: the pool answers from a chained drain, so the check runs after it.
async function granted(request: Promise<unknown>): Promise<boolean> {
  const pending = Symbol("pending");
  await new Promise((resolve) => setImmediate(resolve));
  return (await Promise.race([request, Promise.resolve(pending)])) !== pending;
}

test("a failed retirement of the least recently used runtime refuses only that runtime's target", async () => {
  const fault = new Error("the retired runtime could not be torn down");
  const failing = { owner: "a", plugin: "failing" };
  const bystander = { owner: "b", plugin: "bystander" };
  // The pool closes as the scope ends, and that close must report the failed retirement: the scope's own rejection is
  // the last assertion.
  const scope = async (): Promise<void> => {
    await using pool = new WarmRuntimePool<Target, string>(
      ONE_RUNTIME,
      (target) => (target === failing ? Promise.reject(fault) : Promise.resolve()),
      QUEUE_LIMIT,
      shared,
    );
    const first = await pool.acquire(failing);
    first.ready();
    first.release();

    await expect(pool.acquire(bystander)).resolves.toMatchObject({ cold: true });
    await expect(pool.acquire(failing)).rejects.toBe(fault);
  };

  await expect(scope()).rejects.toMatchObject({ errors: [fault] });
});

test("an owner with its share of the Workers in use leaves one for another owner, and its next call waits for its own", async () => {
  await using pool = new WarmRuntimePool<Target, string>(WORKERS, retired, QUEUE_LIMIT, shared);
  const share = pluginOwnerShare(WORKERS);
  const [overShare, ...held] = targetsOf("member", share + 1);
  const leases = await Promise.all(held.map((target) => pool.acquire(target)));
  for (const lease of leases) {
    lease.ready();
  }

  // Queued first, so a pool that serves strictly in arrival order would make the other owner wait behind it.
  if (overShare === undefined) {
    throw new Error("the member has a call past its share");
  }
  const waiting = pool.acquire(overShare);
  const other = pool.acquire({ owner: "other", plugin: "ping" });
  expect(await granted(other)).toBe(true);
  expect(await granted(waiting)).toBe(false);

  // One of the member's own Workers coming free is what serves its waiting call.
  leases[0]?.release();
  expect(await granted(waiting)).toBe(true);
});

test("a call waiting on its own runtime's start never holds another owner's call behind it", async () => {
  await using pool = new WarmRuntimePool<Target, string>(WORKERS, retired, QUEUE_LIMIT, shared);
  const [starting] = targetsOf("member", 1);
  if (starting === undefined) {
    throw new Error("the member has a plugin");
  }
  const cold = await pool.acquire(starting);
  const second = pool.acquire(starting);
  const other = pool.acquire({ owner: "other", plugin: "ping" });
  expect(await granted(other)).toBe(true);
  expect(await granted(second)).toBe(false);

  cold.ready();
  expect(await granted(second)).toBe(true);
});

test("an owner alone uses every Worker at once, warm, with no wait", async () => {
  await using pool = new WarmRuntimePool<Target, string>(WORKERS, retired, QUEUE_LIMIT, alone);
  const targets = targetsOf("member", WORKERS);
  // Every Worker holds one of the member's runtimes, warm and idle.
  for (const target of targets) {
    const lease = await pool.acquire(target);
    lease.ready();
    lease.release();
  }
  const inUse = targets.map((target) => pool.acquire(target));
  expect(await Promise.all(inUse.map((request) => granted(request)))).toEqual(targets.map(() => true));
  expect((await Promise.all(inUse)).map((lease) => lease.cold)).toEqual(targets.map(() => false));
});

test("a second owner's first call while a sole owner holds every Worker waits for one to free, then is served before the first owner's next", async () => {
  await using pool = new WarmRuntimePool<Target, string>(WORKERS, retired, QUEUE_LIMIT, alone);
  const [later, ...held] = targetsOf("member", WORKERS + 1);
  const leases = await Promise.all(held.map((target) => pool.acquire(target)));
  for (const lease of leases) {
    lease.ready();
  }
  if (later === undefined) {
    throw new Error("the member has one more call");
  }

  // Nothing is free and nothing can be taken back, so the newcomer waits; once it is queued, the share binds. The
  // member's next call is queued first, so serving in arrival order alone would hand it the first free Worker.
  const next = pool.acquire(later);
  const newcomer = pool.acquire({ owner: "newcomer", plugin: "first" });
  expect(await granted(newcomer)).toBe(false);
  expect(await granted(next)).toBe(false);

  // The first Worker to free goes to the newcomer: the member, at its share now, waits for another of its own.
  leases[0]?.release();
  expect(await granted(newcomer)).toBe(true);
  expect(await granted(next)).toBe(false);
  leases[1]?.release();
  expect(await granted(next)).toBe(true);
});

test("one owner's waiting calls, even a sole owner's, leave a place in the request queue for another owner", async () => {
  const [held, ...queued] = targetsOf("member", pluginOwnerShare(PLUGIN_RUNTIME_REQUEST_QUEUE_MAX) + 2);
  const overShare = queued.pop();
  if (held === undefined || overShare === undefined) {
    throw new Error("the member holds the Worker and has a call past its queue share");
  }
  // Each waiting call's outcome, recorded as it settles, so closing the pool leaves no refusal unobserved.
  const outcome = (request: Promise<unknown>): Promise<string> =>
    request.then(
      () => "granted",
      () => "refused",
    );
  const waits: Promise<string>[] = [];
  {
    await using pool = new WarmRuntimePool<Target, string>(ONE_RUNTIME, retired, PLUGIN_RUNTIME_REQUEST_QUEUE_MAX, alone);
    const lease = await pool.acquire(held);
    lease.ready();
    waits.push(...queued.map((target) => outcome(pool.acquire(target))));
    await expect(pool.acquire(overShare)).rejects.toBeInstanceOf(DomainConflictError);
    // The other owner's call is queued, not refused: it waits like any call for the one Worker.
    const other = outcome(pool.acquire({ owner: "other", plugin: "ping" }));
    waits.push(other);
    expect(await granted(other)).toBe(false);
  }
  // Closing the pool refuses every call still waiting; none was refused before it.
  expect(new Set(await Promise.all(waits))).toEqual(new Set(["refused"]));
});

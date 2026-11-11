// A full pool retires its least recently used runtime to serve a request. When that retirement fails, the failure stays
// with the retired target: the request that needed the slot is served, the target's own next request is refused with
// its failure, and closing the pool reports it. Another plugin's call never carries it.
// @subject packages/server/src/infra/plugin-host/warm-runtime-pool.ts
import { expect, test } from "@orb/testkit/node";
import { WarmRuntimePool } from "#server/infra/plugin-host/warm-runtime-pool.ts";

const ONE_RUNTIME = 1;
const QUEUE_LIMIT = 8;

test("a failed retirement of the least recently used runtime refuses only that runtime's target", async () => {
  const fault = new Error("the retired runtime could not be torn down");
  const failing = { plugin: "failing" };
  const bystander = { plugin: "bystander" };
  // The pool closes as the scope ends, and that close must report the failed retirement: the scope's own rejection is
  // the last assertion.
  const scope = async (): Promise<void> => {
    await using pool = new WarmRuntimePool<object>(ONE_RUNTIME, (target) => (target === failing ? Promise.reject(fault) : Promise.resolve()), QUEUE_LIMIT);
    const first = await pool.acquire(failing);
    first.ready();
    first.release();

    await expect(pool.acquire(bystander)).resolves.toMatchObject({ cold: true });
    await expect(pool.acquire(failing)).rejects.toBe(fault);
  };

  await expect(scope()).rejects.toMatchObject({ errors: [fault] });
});

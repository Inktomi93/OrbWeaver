// The ordered boot's gate, every probe injected: vite may start only once the server answers, a server
// that dies first ends the boot, and a ceiling that runs out is a timeout, never a ready.
import { awaitServerReady } from "../../../../tooling/src/dev/index.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

function probes(answers: readonly boolean[]): { healthy: () => Promise<boolean>; asked: () => number } {
  let asked = 0;
  return {
    healthy: async (): Promise<boolean> => {
      const answer = answers[asked] ?? false;
      asked += 1;
      return await Promise.resolve(answer);
    },
    asked: () => asked,
  };
}

const noSleep = async (): Promise<void> => await Promise.resolve();

test("a server that answers late is ready, after exactly the polls it took", async () => {
  const late = probes([false, false, true]);
  expect(await awaitServerReady({ healthy: late.healthy, exited: () => false, ceilingMs: 5000, sleep: noSleep, pollMs: 500 })).toBe("ready");
  expect(late.asked()).toBe(3);
});

test("a server that exits during boot ends the gate before another probe", async () => {
  let polls = 0;
  const exited = (): boolean => polls >= 2;
  const healthy = async (): Promise<boolean> => {
    polls += 1;
    return await Promise.resolve(false);
  };
  expect(await awaitServerReady({ healthy, exited, ceilingMs: 5000, sleep: noSleep, pollMs: 500 })).toBe("exited");
  expect(polls).toBe(2);
});

test("a ceiling that runs out is a timeout, counted in polls rather than read off a clock", async () => {
  const never = probes([]);
  const slept: number[] = [];
  const sleep = async (ms: number): Promise<void> => {
    slept.push(ms);
    await Promise.resolve();
  };
  expect(await awaitServerReady({ healthy: never.healthy, exited: () => false, ceilingMs: 2000, sleep, pollMs: 500 })).toBe("timeout");
  expect(slept).toEqual([500, 500, 500, 500]);
  // …and a server that died on the last poll is reported as such, not as a timeout.
  expect(await awaitServerReady({ healthy: never.healthy, exited: () => true, ceilingMs: 1, sleep, pollMs: 500 })).toBe("exited");
});

// A compiler's memory high-water mark is gone once it exits, and one that starts, serves and closes inside a single
// synchronous call falls in no timed sample. Every API closes through dispose, which announces its compiler processes on
// COMPILER_ENDING_CHANNEL while they still run, and the profile reads each one's memory there.
import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { subscribe, unsubscribe } from "node:diagnostics_channel";
import { once } from "node:events";
import process from "node:process";
import { expect, plantedTsconfig, test } from "@orb/testkit/tooling";
import { GraphProfile } from "../../../tooling/src/unwired/graph/profile.ts";
import { COMPILER_CHANNEL, COMPILER_ENDING_CHANNEL, compilerStartOf, NativeWorld } from "../../../tooling/src/unwired/native.ts";
import { LIB, WORLD } from "./_planted.ts";

const HELD_MB = 200;
// A peak the allocation alone explains: far above what a compiler that only just spawned holds.
const FLOOR_MB = HELD_MB / 2;
// Reports idle, then holds its memory once told to, so the start sample is taken before the growth and the close after.
const HOLD = `console.log("idle"); process.stdin.once("data", () => { const held = Buffer.alloc(${String(HELD_MB)} * 1e6, 1); console.log("held " + held.length); }); setInterval(() => {}, 1000);`;

test("each way a compiler session closes announces its running compiler first", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree({ [WORLD]: plantedTsconfig({ lib: LIB }), "packages/a/src/one.ts": "export const one = 1;" });
  const started: string[] = [];
  const ending: { readonly config: string; readonly running: boolean }[] = [];
  const onStart = (message: unknown): void => {
    const start = compilerStartOf(message);
    if (start !== undefined) {
      started.push(start.config);
    }
  };
  const onEnding = (message: unknown): void => {
    const start = compilerStartOf(message);
    if (start !== undefined) {
      ending.push({ config: start.config, running: start.process.exitCode === null && start.process.signalCode === null });
    }
  };
  subscribe(COMPILER_CHANNEL, onStart);
  subscribe(COMPILER_ENDING_CHANNEL, onEnding);
  try {
    NativeWorld.fileLists(root, [WORLD]);
    NativeWorld.readTexts(root, new Map([["packages/a/src/two.ts", "export const two = 2;"]]), () => null);
    NativeWorld.open(root, WORLD)[Symbol.dispose]();
  } finally {
    unsubscribe(COMPILER_CHANNEL, onStart);
    unsubscribe(COMPILER_ENDING_CHANNEL, onEnding);
  }
  // Three sessions: the file lists (a `using` api), the texts parsed alone (another) and one world (its own dispose).
  expect(started).toHaveLength(3);
  expect(ending.map(({ config }) => config).toSorted()).toEqual(started.toSorted());
  expect(ending.map(({ running }) => running)).toEqual([true, true, true]);
});

// The world's constructor asks `declarations` which declaration files to keep, so a set that refuses the planted one
// throws from inside the constructor, after its compiler started.
class RefusingDeclarations extends Set<string> {
  override has(file: string): boolean {
    throw new Error(`refused ${file}`);
  }
}

test("a world whose constructor throws closes its compiler session before the throw leaves open", { timeout: 120_000 }, async ({ plantedTree }) => {
  const root = await plantedTree({
    [WORLD]: plantedTsconfig({ lib: LIB }),
    "packages/a/src/one.ts": "export const one = 1;",
    "packages/a/src/ambient.d.ts": "declare const ambient: number;",
  });
  const started: ChildProcess[] = [];
  const ending: { readonly pid: number | undefined; readonly running: boolean }[] = [];
  const onStart = (message: unknown): void => {
    const start = compilerStartOf(message);
    if (start !== undefined) {
      started.push(start.process);
    }
  };
  const onEnding = (message: unknown): void => {
    const start = compilerStartOf(message);
    if (start !== undefined) {
      ending.push({ pid: start.process.pid, running: start.process.exitCode === null && start.process.signalCode === null });
    }
  };
  subscribe(COMPILER_CHANNEL, onStart);
  subscribe(COMPILER_ENDING_CHANNEL, onEnding);
  try {
    expect(() => NativeWorld.open(root, WORLD, new RefusingDeclarations())).toThrow("refused packages/a/src/ambient.d.ts");
  } finally {
    unsubscribe(COMPILER_CHANNEL, onStart);
    unsubscribe(COMPILER_ENDING_CHANNEL, onEnding);
  }
  expect(started).toHaveLength(1);
  expect(ending).toEqual([{ pid: started[0]?.pid, running: true }]);
  // the session's dispose ends the compiler, so the process exits without anyone killing it
  await Promise.all(started.map(async (child) => (child.exitCode === null && child.signalCode === null ? once(child, "exit") : undefined)));
});

// Linux alone reads another process's memory.
test.skipIf(process.platform !== "linux")(
  "a compiler's peak is read in the sample taken as it closes, after a start sample that saw almost nothing",
  async () => {
    const peakOf = async (readAtClose: boolean): Promise<number | null> => {
      const profile = new GraphProfile();
      const child = spawn(process.execPath, ["-e", HOLD], { stdio: ["pipe", "pipe", "ignore"] });
      try {
        await once(child.stdout, "data");
        // The start sample, taken while the process holds almost nothing, as a compiler's is.
        profile.watch({ process: child, config: "held" });
        child.stdin.write("hold\n");
        await once(child.stdout, "data");
        if (readAtClose) {
          profile.beforeClose();
        }
        const exited = once(child, "exit");
        child.kill();
        await exited;
        return (
          profile.report({ counts: new Map(), peaks: new Map(), dynamicAxes: [] }, null, { compilers: [], nodeHeap: null }).memory.compilers[0]?.peakMb ?? null
        );
      } finally {
        child.kill();
      }
    };
    // Control: with no sample as it closes, the compiler's peak is whatever the start sample saw.
    expect(await peakOf(false)).toBeLessThan(FLOOR_MB);
    expect(await peakOf(true)).toBeGreaterThanOrEqual(FLOOR_MB);
  },
);

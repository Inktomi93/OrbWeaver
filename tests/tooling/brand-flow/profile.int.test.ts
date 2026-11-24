// `pnpm brand-flow --profile` through the spawned CLI over a planted world: the run prints the profile lines the unwired
// graph verbs print, a multi-kind profile adds each world's compiler profiles and Node's heap by allocating function, a
// bare `--profile` stays wall-only, and a kind outside the tuple is refused before any world opens.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, plantedTsconfig, test } from "@orb/testkit/tooling";
import { EXIT } from "../../../tooling/src/floor/cli/exit-contract.ts";
import { PROFILES } from "../../../tooling/src/unwired/index.ts";
import { LIB, WORLD } from "../unwired/_planted.ts";

const TREE = {
  [WORLD]: plantedTsconfig({ lib: LIB }),
  "packages/a/src/ids.ts": "export type Branded<B extends string> = string & { readonly brand: B };\nexport const id = (raw: string): string => raw;",
};
const RUN = { timeout: 180_000 };

// The stderr lines of a run that start with `prefix`.
const lines = (stderr: string, prefix: string): string[] => stderr.split("\n").filter((line) => line.startsWith(prefix));

test(
  "a multi-kind profile prints the phases, the summed requests, every process's peak and each compiler and Node heap profile",
  RUN,
  async ({ plantedTree, runCli, scratch }) => {
    const root = await plantedTree(TREE);
    const out = join(scratch, "out");
    const result = await runCli("brand-flow", [`--root=${root}`, `--out=${out}`, `--world=${WORLD}`, `--profile=${PROFILES.join(",")}`], {
      timeoutMs: RUN.timeout,
    });
    await expect(result).toExitWith(EXIT.clean);
    expect(lines(result.stderr, "profile phases ")[0]).toMatch(/ open=\d+ms walk=\d+ms .* analyse=\d+ms /u);
    expect(lines(result.stderr, "profile requests ")[0]).toMatch(/ sent=[1-9]\d* /u);
    expect(lines(result.stderr, "profile checker ")[0]).toMatch(/ requests=[1-9]\d* /u);
    // The world list's compiler and the world's own both report a peak, beside Node's and the combined bound.
    expect(lines(result.stderr, "profile memory ")[0]).toMatch(
      new RegExp(
        `node-peak=[1-9]\\d*MB compiler-peaks ${WORLD}\\(pid \\d+, open\\)=[1-9]\\d*MB ${WORLD}\\(pid \\d+, open\\)=[1-9]\\d*MB combined sampled=[1-9]\\d*MB bound=[1-9]\\d*MB$`,
        "u",
      ),
    );
    expect(lines(result.stderr, "profile counts ")[0]).toContain(`peak node heap MB after ${WORLD}=`);
    const profiled = (kind: string): string[] => lines(result.stderr, `profile ${kind} `).map((line) => line.split(" ")[2]?.replace(/:$/u, "") ?? "");
    const [cpu] = profiled("cpu");
    const [heap] = profiled("heap");
    const [nodeHeap] = lines(result.stderr, "profile node heap ").map((line) => line.split(" ")[3]?.replace(/:$/u, "") ?? "");
    for (const path of [cpu, heap, nodeHeap]) {
      expect(path?.startsWith(join(out, "profile"))).toBe(true);
      expect(existsSync(path ?? "")).toBe(true);
    }
    expect(result.stderr).toContain(`${WORLD}: node heap after close=`);
  },
);

test("a bare profile measures wall time alone, and a kind outside the tuple is refused", RUN, async ({ plantedTree, runCli, scratch }) => {
  const root = await plantedTree(TREE);
  const base = [`--root=${root}`, `--out=${join(scratch, "out")}`, `--world=${WORLD}`];
  const wall = await runCli("brand-flow", [...base, "--profile"], { timeoutMs: RUN.timeout });
  await expect(wall).toExitWith(EXIT.clean);
  expect(lines(wall.stderr, "profile memory ")).toHaveLength(1);
  expect(lines(wall.stderr, "profile heap ")).toEqual([]);
  expect(lines(wall.stderr, "profile node heap ")).toEqual([]);
  const refused = await runCli("brand-flow", [...base, "--profile=wall,leak"]);
  await expect(refused).toExitWith(EXIT.misuse);
  expect(refused.stderr).toContain("--profile=leak");
  expect(lines(refused.stderr, "profile ")).toEqual([]);
});

// `pnpm brand-flow --profile` through the spawned CLI over a planted tree: the per-world scan prints the profile lines
// the unwired graph verbs print, and the optional-pairs graph session that follows prints its own under a heading, its
// merged-program compiler among the peaks. A multi-kind profile adds each compiler's profiles and Node's heap by
// allocating function, a bare `--profile` stays wall-only, and a kind outside the tuple is refused before any world opens.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { EXIT } from "../../../tooling/src/floor/cli/exit-contract.ts";
import { PROFILES } from "../../../tooling/src/unwired/index.ts";
import { MERGED_CONFIG } from "../../../tooling/src/unwired/worlds.ts";
import { graphTree, WORLD } from "../unwired/_planted.ts";

const TREE = graphTree({
  "packages/a/src/ids.ts": "export type Branded<B extends string> = string & { readonly brand: B };\nexport const id = (raw: string): string => raw;",
});
const RUN = { timeout: 180_000 };
const SESSION_HEADING = "profile session optional-pairs graph";

const escaped = (text: string): string => text.replaceAll(/[.()]/gu, "\\$&");

// A run's stderr lines that start with `prefix`, split at the graph session's heading into the scan's and the session's.
function parts(stderr: string): { readonly scan: (prefix: string) => string[]; readonly graph: (prefix: string) => string[] } {
  const all = stderr.split("\n");
  const at = all.findIndex((line) => line.startsWith(SESSION_HEADING));
  const pick =
    (from: readonly string[]): ((prefix: string) => string[]) =>
    (prefix: string): string[] =>
      from.filter((line) => line.startsWith(prefix));
  return { scan: pick(at < 0 ? all : all.slice(0, at)), graph: pick(at < 0 ? [] : all.slice(at + 1)) };
}

// The file a `profile <kind> <path>: …` line names.
const pathsOf = (found: readonly string[], word: number): string[] => found.map((line) => line.split(" ")[word]?.replace(/:$/u, "") ?? "");

test(
  "a multi-kind profile measures the scan and the optional-pairs graph session, each compiler's peak and heap included",
  RUN,
  async ({ plantedTree, runCli, scratch }) => {
    const root = await plantedTree(TREE);
    const out = join(scratch, "out");
    const result = await runCli("brand-flow", [`--root=${root}`, `--out=${out}`, `--world=${WORLD}`, `--profile=${PROFILES.join(",")}`], {
      timeoutMs: RUN.timeout,
    });
    await expect(result).toExitWith(EXIT.clean);
    const { scan, graph } = parts(result.stderr);
    expect(scan("profile phases ")[0]).toMatch(/ open=\d+ms walk=\d+ms .* analyse=\d+ms /u);
    expect(scan("profile requests ")[0]).toMatch(/ sent=[1-9]\d* /u);
    expect(scan("profile checker ")[0]).toMatch(/ requests=[1-9]\d* /u);
    // The world list's compiler and the world's own, and no compiler the graph session started.
    expect(scan("profile memory ")[0]).toMatch(
      new RegExp(
        `node-peak=[1-9]\\d*MB compiler-peaks ${WORLD}\\(pid \\d+, open\\)=[1-9]\\d*MB ${WORLD}\\(pid \\d+, open\\)=[1-9]\\d*MB combined sampled=[1-9]\\d*MB bound=[1-9]\\d*MB$`,
        "u",
      ),
    );
    expect(scan("profile counts ")[0]).toContain(`peak node heap MB after ${WORLD}=`);
    expect(result.stderr).toContain(`${WORLD}: node heap after close=`);
    // The graph session's own phases, and its merged-program compiler among the peaks.
    expect(graph("profile phases ")[0]).toMatch(/ open=\d+ms walk=[1-9]\d*ms /u);
    expect(graph("profile memory ")[0]).toMatch(
      new RegExp(`compiler-peaks ${escaped(MERGED_CONFIG)}\\(pid \\d+, open\\)=[1-9]\\d*MB .*bound=[1-9]\\d*MB$`, "u"),
    );
    expect(scan("profile run memory ")).toEqual([]);
    expect(graph("profile run memory ")[0]).toMatch(/^profile run memory bound=[1-9]\d*MB$/u);
    const files = [
      ...pathsOf([...scan("profile cpu /"), ...scan("profile heap /")], 2).map((path) => ({ path, dir: join(out, "profile") })),
      ...pathsOf(scan("profile node heap "), 3).map((path) => ({ path, dir: join(out, "profile") })),
      ...pathsOf([...graph("profile cpu /"), ...graph("profile heap /")], 2).map((path) => ({ path, dir: join(out, "profile", "optional-pairs") })),
      ...pathsOf(graph("profile node heap "), 3).map((path) => ({ path, dir: join(out, "profile", "optional-pairs") })),
    ];
    // A cpu and a heap profile per compiler side, and one Node heap profile per part.
    expect(files).toHaveLength(6);
    for (const { path, dir } of files) {
      expect(path.startsWith(dir)).toBe(true);
      expect(existsSync(path)).toBe(true);
    }
  },
);

test("a bare profile measures wall time alone, and a kind outside the tuple is refused", RUN, async ({ plantedTree, runCli, scratch }) => {
  const root = await plantedTree(TREE);
  const base = [`--root=${root}`, `--out=${join(scratch, "out")}`, `--world=${WORLD}`];
  const wall = await runCli("brand-flow", [...base, "--profile"], { timeoutMs: RUN.timeout });
  await expect(wall).toExitWith(EXIT.clean);
  const { scan, graph } = parts(wall.stderr);
  expect([...scan("profile memory "), ...graph("profile memory ")]).toHaveLength(2);
  expect([...scan("profile heap "), ...graph("profile heap ")]).toEqual([]);
  expect([...scan("profile node heap "), ...graph("profile node heap ")]).toEqual([]);
  const refused = await runCli("brand-flow", [...base, "--profile=wall,leak"]);
  await expect(refused).toExitWith(EXIT.misuse);
  expect(refused.stderr).toContain("--profile=leak");
  expect(refused.stderr.split("\n").filter((line) => line.startsWith("profile "))).toEqual([]);
});

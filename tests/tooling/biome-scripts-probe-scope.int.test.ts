// BIOME'S SCOPE OVER `scripts/probes/**` — the deliberate fence, and the agreement between the three
// instruments that ask about it (#2299; sibling of #2290's ESLint half and #1942's `.claude` half).
//
// WHAT WAS MEASURED (2026-09-13, biome 2.5.1, before the fix). 32 tracked `.ts` files live under
// `scripts/probes`. NINETEEN were checked by the shipping gate and all nineteen were CLEAN — the flat
// `sdk-*-probe.ts` set, `impersonate/`, `st-goldens/` (whose `biome.json` override therefore is live) and
// `transcript-census.ts`. THIRTEEN were invisible: the nine under `openrouter/` and the four under
// `rpg-extraction/`. So "`scripts/probes/**` is ignored by biome" was over-broad by 19 files; the fence is
// exactly the two directories that carry a directory-local `.gitignore` starting `*/`.
//
// THE MECHANISM, ISOLATED. `biome.json` sets `vcs.useIgnoreFile: true`, and biome reads NESTED ignore
// files, not only the repo-root one — and it does NOT honour their negations, so `rpg-extraction`'s
// `!*.ts` re-include was ineffective and the whole directory fell out of scope. Each of those two files
// carried a comment saying that side effect was ON PURPOSE. It still is; what was wrong is that a
// deliberate lint fence was riding an accident of another tool's ignore semantics, where nothing could see
// it and where a third instrument disagreed.
//
// THE THREE ANSWERS, AND WHICH ONE WAS THE DEFECT.
//   1. `biome check .` (the shipping `lint:biome` stage): silently never visited the 13.
//   2. `pnpm exec biome check scripts/probes/openrouter/_kit.ts`: **EXIT 1** with "These paths were
//      provided but ignored". #2299's row said EXIT 0 — REFUTED on this tree. Biome's default spelling
//      REFUSES LOUDLY on an ignored path, which is the honest behaviour and is NOT the `isPathIgnored`
//      false-clean shape #2290 closed. Exit 0 needs `--no-errors-on-unmatched`.
//   3. The EDIT HOOK (`.claude/hooks/biome-check.sh`, `--config-path=tooling/biome.edit.jsonc
//      … --no-errors-on-unmatched`): linted `_kit.ts` and reported FIFTEEN errors. That is the dangerous
//      answer — a hook accusing a file the shipping gate does not judge — and the cause is
//      `biome.edit.jsonc`'s `files.experimentalScannerIgnores: [… "scripts" …]`, which suppresses nested
//      ignore-FILE discovery for those trees. Isolated by driving an otherwise byte-identical
//      extends-root config with the scanner ignores removed: "Checked 0 files", exit 0.
//
// THE FIX IS ONE LINE OF MECHANISM, NOT A RULE CHANGE. The fence moved into `biome.json`'s
// `files.includes` as two explicit negations. `biome.edit.jsonc` `extends` that file, so both configs now
// answer the same way and the hook can no longer accuse a fenced path. No rule was disabled, nothing was
// labelled checked-clean, and the loud refusal of answer 2 is unchanged.
//
// WHY THIS TEST EXISTS AT ALL. `biome-grant-liveness` reads OVERRIDE `includes` rows and
// `config:biome-rule-liveness` reads rule-off grants — neither has `files.includes` in its population, so
// the two new fence rows are held live by NOTHING in the gate corpus. This file is their two-sided keeper:
// the reason and the END CONDITION are data below, each row must be declared in `biome.json`, each fenced
// directory must still hold tracked TypeScript, and both configs must agree. A control OUTSIDE the fence
// proves the drive can see a file at all, so a broken spawn cannot read as "everything is fenced".

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnNiced } from "@orb/tooling/_shared/proc";
import { expect, test } from "../support/tool-fixtures.ts";
import { scaledBudget } from "./_load-budget.ts";

const BIOME_SPAWN_TIMEOUT_MS = scaledBudget(90_000);

interface ProbeFence {
  /** The repo-relative directory, spelled exactly as the `biome.json` `files.includes` negation names it. */
  readonly dir: string;
  readonly why: string;
  readonly endsWhen: string;
}

/** THE DELIBERATELY UNCOVERED TREES. Each row is a decision with a reason and an end condition — never a
 *  permanent amnesty, and never a silent one. The constitution excepts throwaway scripts and dev tooling
 *  from the architecture rigor (§0.1 tripwire 2), which is the authority these rows rest on. */
const PROBE_FENCES: readonly ProbeFence[] = [
  {
    dir: "scripts/probes/openrouter",
    why:
      "one-shot wire-behaviour harnesses driven by hand against a live OpenRouter key. They exist to answer a " +
      "question once and be read as evidence afterwards (their `RESULTS.md` is the deliverable, the `.ts` is the " +
      "apparatus): raw `process.env`, raw wire literals and long inline request bodies are the POINT, and the " +
      "house rules that would fire — `noProcessEnv`, `noProcessGlobal`, `noMagicNumbers`, `useExplicitReturnType` " +
      "— would each need a rule-off grant that says nothing true about product code. Nothing here ships or is " +
      "imported by anything that does.",
    endsWhen:
      "any file in this directory is imported by product, tooling or test code, or the directory stops being " +
      "hand-driven one-shots — at which point it becomes ordinary `scripts/**` and the negation is deleted, not " +
      "widened.",
  },
  {
    dir: "scripts/probes/rpg-extraction",
    why:
      "the RPG extraction spike's probe harnesses — same class as `openrouter/`: hand-driven one-shots against " +
      "local and hosted models whose output is the evidence. Its own `.gitignore` already treats the directory as " +
      "scratch-with-committed-sources.",
    endsWhen: "the same condition as `openrouter/` — an importer, or the directory ceasing to be hand-driven one-shots.",
  },
];

/** The fenced files, from git rather than a walk: an untracked scratch `.ts` is not the population. */
function trackedTypeScriptUnder(repoRoot: string, dir: string): readonly string[] {
  const result = spawnSync("git", ["ls-files", "--", `${dir}/*.ts`, `${dir}/**/*.ts`], { cwd: repoRoot, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ls-files failed for ${dir}: ${result.stderr}`);
  }
  return result.stdout.split("\n").filter((line) => line.length > 0);
}

/** Drive the real biome binary and return the "Checked N files" count it reports. `--no-errors-on-unmatched`
 *  is what makes an all-ignored path set exit 0 instead of refusing, which is the ONLY reason it is here:
 *  the count is the measurement, never the exit code. */
async function checkedFileCount(repoRoot: string, configPath: string | null, paths: readonly string[]): Promise<number> {
  const args = ["exec", "biome", "check", "--reporter=concise", "--diagnostic-level=error", "--no-errors-on-unmatched"];
  if (configPath !== null) {
    args.push(`--config-path=${configPath}`);
  }
  const result = await spawnNiced("pnpm", [...args, ...paths], { cwd: repoRoot, timeoutMs: BIOME_SPAWN_TIMEOUT_MS });
  const match = /Checked (\d+) files? in /u.exec(`${result.stdout}\n${result.stderr}`);
  if (match?.[1] === undefined) {
    throw new Error(`biome printed no "Checked N files" line — the run is not a measurement.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  }
  return Number(match[1]);
}

/** `biome.json` is STRICT JSON by law (a `//` makes biome fall back to built-in defaults), so a plain
 *  parse is the honest read — and a shape that is not the expected one THROWS rather than reading as an
 *  empty include list, which would make the declaration arm below vacuously green. */
function biomeFileIncludes(repoRoot: string): readonly string[] {
  const parsed: unknown = JSON.parse(readFileSync(join(repoRoot, "biome.json"), "utf8"));
  const files = typeof parsed === "object" && parsed !== null ? Reflect.get(parsed, "files") : undefined;
  const includes = typeof files === "object" && files !== null ? Reflect.get(files, "includes") : undefined;
  if (!Array.isArray(includes) || includes.length === 0) {
    throw new Error("biome.json has no files.includes array — the fence rows cannot be judged and a clean pass would claim they were.");
  }
  return includes as readonly string[];
}

test("every probe fence is DECLARED in biome.json and still names tracked TypeScript", ({ repoRoot }) => {
  const includes = biomeFileIncludes(repoRoot);

  expect(PROBE_FENCES.filter(({ dir }) => !includes.includes(`!${dir}`)).map(({ dir }) => dir)).toEqual([]);
  expect(PROBE_FENCES.filter(({ dir }) => trackedTypeScriptUnder(repoRoot, dir).length === 0).map(({ dir }) => dir)).toEqual([]);
  expect(PROBE_FENCES.filter(({ why, endsWhen }) => why.trim().length === 0 || endsWhen.trim().length === 0)).toEqual([]);
});

test(
  "the shipping config and the EDIT HOOK's config agree about the fence — neither accuses what the other ignores",
  async ({ repoRoot }) => {
    const fenced = PROBE_FENCES.flatMap(({ dir }) => trackedTypeScriptUnder(repoRoot, dir));
    // The control comes FIRST: if the drive cannot see an ordinary probe file, every zero below is a broken
    // spawn wearing a fence's clothes.
    const control = "scripts/probes/impersonate/run.ts";

    expect(await checkedFileCount(repoRoot, null, [control])).toBe(1);
    expect(await checkedFileCount(repoRoot, "tooling/biome.edit.jsonc", [control])).toBe(1);
    expect(fenced.length).toBeGreaterThan(1);
    expect(await checkedFileCount(repoRoot, null, fenced)).toBe(0);
    expect(await checkedFileCount(repoRoot, "tooling/biome.edit.jsonc", fenced)).toBe(0);
  },
  BIOME_SPAWN_TIMEOUT_MS,
);

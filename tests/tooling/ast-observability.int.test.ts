// The `pnpm ast` AUDIT EPILOGUE's proof (scripts/codemods/ast.ts, "THE SCAN LEDGER"). Driven through the
// REAL CLI entry point — a spawned `node scripts/codemods/ast.ts …` over the REAL tree — because the whole
// property under test is "what the corpus/scope resolution actually did", and an in-memory project would
// re-implement precisely the thing that can lie.
//
// The defect this pins (Codex repository audit, 2026-08-13): `no results` and `the search never happened`
// printed the SAME line, so a lens could read clean while blind. The two rows are a matched pair and each
// is the other's control:
//   • ZERO WITH PROOF — a real empty answer: `scanned>0`, `matches=0`, `status=complete`, exit 0.
//   • ZERO WITHOUT SCAN — a scope/`--in` that admits no file: `scanned=0`, `status=error`,
//     `SCOPE ENTERED NOTHING`, exit 2 (the exit-2 tool-error discipline `resolveScope` already had).
// A green here is meaningful only because the SAME assertion shape separates them.
//
// Two more invariants a pipeline depends on: the epilogue is STDERR-only (stdout stays byte-compatible —
// `pnpm ast apisurface … > file` must keep producing the same file), and `--json` gains `meta` ADDITIVELY
// beside the untouched `label`/`total`/`shown`/`hits` keys.
//
// SLOW BY CONSTRUCTION: every row pays one real ts-morph workspace load (~11s). All rows use SYNTACTIC
// verbs (the `harness-globs` arm) — the typed arm would triple it for no extra coverage of THIS seam.
import { spawnSync } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { expect, test } from "../support/fixtures.ts";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const AST_CLI = fileURLToPath(new URL("../../scripts/codemods/ast.ts", import.meta.url));
const SPAWN_TIMEOUT_MS = 120_000;

interface AstRun {
  stdout: string;
  stderr: string;
  status: number | null;
  epilogue: Record<string, string>;
}

const EPILOGUE_LANGS_TS_RE = /\bts:\d+/u;
const EPILOGUE_STATUS_OK_RE = /^(complete|partial)$/u;

/** The epilogue's fields, parsed. Its sub-values are deliberately space-free (`langs=ts:12,tsx:3`), which
 *  is what lets a reader — and this parser — split the line on whitespace. */
function parseEpilogue(stderr: string): Record<string, string> {
  const line = stderr.split("\n").find((l) => l.startsWith("[ast] verb="));
  if (line === undefined) {
    return {};
  }
  const fields: Record<string, string> = {};
  for (const token of line.slice("[ast] ".length).split(" ")) {
    const cut = token.indexOf("=");
    if (cut > 0) {
      fields[token.slice(0, cut)] = token.slice(cut + 1);
    }
  }
  return fields;
}

function runAst(argv: readonly string[]): AstRun {
  const res = spawnSync(process.execPath, [AST_CLI, ...argv], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    timeout: SPAWN_TIMEOUT_MS,
  });
  const stdout = res.stdout ?? "";
  const stderr = res.stderr ?? "";
  return { stdout, stderr, status: res.status, epilogue: parseEpilogue(stderr) };
}

test(
  "a zero-match run PROVES it scanned — scanned>0, matches=0, status=complete",
  () => {
    // `packages/kit/src/index.ts` is a one-line placeholder barrel: a REAL empty answer, not a missed one.
    const run = runAst(["exports", "packages/kit/src/index.ts"]);
    expect(run.stdout).toBe("RESULT ast exports packages/kit/src/index.ts: no results\n");
    expect(run.status).toBe(0);
    expect(Number(run.epilogue["scanned"])).toBeGreaterThan(0);
    expect(run.epilogue["matches"]).toBe("0");
    expect(run.epilogue["status"]).toBe("complete");
    // langs names the LANGUAGE(S) actually walked — the TS/TSX undercount tell.
    expect(run.epilogue["langs"]).toMatch(EPILOGUE_LANGS_TS_RE);
    expect(run.epilogue["scope"]).toContain("path:packages/kit/src/index.ts");
    expect(run.epilogue["scope"]).toContain("corpus:harness-globs");
  },
  SPAWN_TIMEOUT_MS,
);

test(
  "a matching run reports its matches, and the epilogue never touches stdout",
  () => {
    const run = runAst(["exports", "packages/kit/src/ids"]);
    expect(run.status).toBe(0);
    expect(Number(run.epilogue["matches"])).toBeGreaterThan(0);
    expect(run.epilogue["status"]).toMatch(EPILOGUE_STATUS_OK_RE);
    // Byte-compatibility for pipelines: `pnpm ast … > file` keeps producing exactly what it used to.
    expect(run.stdout).not.toContain("[ast]");
    expect(run.stdout).toContain("RESULT ast exports packages/kit/src/ids:");
    expect(run.stderr).toContain("[ast] verb=exports");
  },
  SPAWN_TIMEOUT_MS,
);

test(
  "an --in filter that admits no file is a TOOL ERROR, not a clean zero",
  () => {
    // `scripts/dev/**` is real on disk and absent from the SYNTACTIC corpus (harness-globs loads only
    // scripts/check/gates) — the exact shape that used to print `no results` from a search of nothing.
    const run = runAst(["ident", "REPO_ROOT", "--in", "scripts/dev"]);
    expect(run.epilogue["scanned"]).toBe("0");
    expect(run.epilogue["status"]).toBe("error");
    expect(run.stderr).toContain("SCOPE ENTERED NOTHING");
    expect(run.status).toBe(2);
  },
  SPAWN_TIMEOUT_MS,
);

test(
  "a positional path scope that admits no file exits 2 the same way",
  () => {
    const run = runAst(["exports", "packages/no-such-package/src"]);
    expect(run.epilogue["scanned"]).toBe("0");
    expect(run.epilogue["skipped"]).not.toBe("0");
    expect(run.epilogue["status"]).toBe("error");
    expect(run.status).toBe(2);
  },
  SPAWN_TIMEOUT_MS,
);

test(
  "--json carries the same audit fields as `meta`, beside the untouched result shape",
  () => {
    // `--max` above the hit count so nothing is capped — this row pins the COMPLETE status too.
    const run = runAst(["exports", "packages/kit/src/ids", "--json", "--max", "500"]);
    expect(run.status).toBe(0);
    const parsed = JSON.parse(run.stdout) as {
      label: string;
      total: number;
      shown: number;
      hits: unknown[];
      meta: {
        verb: string;
        scope: string;
        langs: Record<string, number>;
        scanned: number;
        skipped: number;
        skippedBy: Record<string, number>;
        matches: number;
        status: string;
      };
    };
    // the pre-existing shape, unmoved
    expect(parsed.label).toContain("exports packages/kit/src/ids");
    expect(parsed.total).toBeGreaterThan(0);
    expect(parsed.hits.length).toBe(parsed.shown);
    // the additive audit block, agreeing with the stderr epilogue's own numbers
    expect(parsed.meta.verb).toBe("exports");
    expect(parsed.meta.scanned).toBeGreaterThan(0);
    expect(parsed.meta.matches).toBe(parsed.total);
    expect(parsed.meta.status).toBe("complete");
    expect(parsed.meta.langs["ts"]).toBeGreaterThan(0);
    expect(Object.keys(parsed.meta.skippedBy).sort()).toEqual(["declaration-file", "out-of-filter", "out-of-scope", "test-file"]);
    expect(String(parsed.meta.scanned)).toBe(run.epilogue["scanned"]);
  },
  SPAWN_TIMEOUT_MS,
);

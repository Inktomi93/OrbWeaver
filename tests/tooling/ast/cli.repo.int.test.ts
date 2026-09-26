// The real `pnpm ast` process boundary: dispatch, governed corpus selection, stdout/stderr separation,
// audited zeroes, and exit classes. Lens behavior and formatting use the same production verbs over tiny
// projects in ops/verbs.test.ts, avoiding a full repository load for every semantic assertion.
import { fileURLToPath } from "node:url";
import { expect, test } from "../../support/tool-fixtures.ts";
import { scaledBudget, spawnNodeWithBudget } from "../_load-budget.ts";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const AST_CLI = fileURLToPath(new URL("../../../tooling/src/ast/cli.ts", import.meta.url));
const SPAWN_TIMEOUT_MS = scaledBudget(120_000);
// registry-candidates is a lens over the whole harness corpus, so it is the file's one long run. MEASURED as a bare
// `pnpm ast registry-candidates --json --max 1`: 146 s at per-core load 0.7, and 126 s beside three whole typechecks.
// The base is twice the worst reading.
const WHOLE_CORPUS_LENS_TIMEOUT_MS = scaledBudget(292_000);

interface AstRun {
  readonly stdout: string;
  readonly stderr: string;
  readonly status: number | null;
  readonly epilogue: Record<string, string>;
}

function parseEpilogue(stderr: string): Record<string, string> {
  const line = stderr.split("\n").find((candidate) => candidate.startsWith("[ast] verb="));
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

function runAst(argv: readonly string[], timeoutMs: number = SPAWN_TIMEOUT_MS): AstRun {
  const result = spawnNodeWithBudget([AST_CLI, ...argv], REPO_ROOT, timeoutMs, `pnpm ast ${argv.join(" ")}`);
  return { ...result, epilogue: parseEpilogue(result.stderr) };
}

test(
  "a real zero-match run proves it scanned and keeps the epilogue on stderr",
  () => {
    const run = runAst(["exports", "packages/kit/src/index.ts"]);
    expect(run.status).toBe(0);
    expect(run.stdout).toBe("RESULT ast exports packages/kit/src/index.ts: no results\n");
    expect(run.stdout).not.toContain("[ast]");
    expect(Number(run.epilogue["scanned"])).toBeGreaterThan(0);
    expect(run.epilogue["langs"]).toMatch(/\bts:\d+/u);
    expect(run.epilogue).toMatchObject({ matches: "0", status: "complete" });
  },
  SPAWN_TIMEOUT_MS,
);

test(
  "a real output filter that enters no file is a tool error rather than a clean zero",
  () => {
    const run = runAst(["ident", "REPO_ROOT", "--in", "scripts/dev"]);
    expect(run.status).toBe(2);
    expect(run.epilogue).toMatchObject({ scanned: "0", status: "error" });
    expect(run.stderr).toContain("SCOPE ENTERED NOTHING");
  },
  SPAWN_TIMEOUT_MS,
);

test(
  "a real filtered TSX JSON run preserves the payload and additive audit receipt",
  () => {
    const run = runAst(["jsx", "Skeleton", "--in", "packages/ui/src", "--json", "--max", "500"]);
    expect(run.status).toBe(0);
    const parsed = JSON.parse(run.stdout) as {
      label: string;
      total: number;
      shown: number;
      hits: unknown[];
      meta: { verb: string; scanned: number; matches: number; status: string; langs: Record<string, number>; skippedBy: Record<string, number> };
    };
    expect(parsed.label).toContain("jsx Skeleton");
    expect(parsed.total).toBeGreaterThan(0);
    expect(parsed.hits).toHaveLength(parsed.shown);
    expect(parsed.meta).toMatchObject({ verb: "jsx", matches: parsed.total, status: "complete" });
    expect(parsed.meta.scanned).toBeGreaterThan(0);
    expect(parsed.meta.langs["tsx"]).toBeGreaterThan(0);
    expect((parsed.hits as { file: string }[]).every(({ file }) => file.includes("packages/ui/src"))).toBe(true);
    expect(Object.keys(parsed.meta.skippedBy).sort()).toEqual(["declaration-file", "out-of-filter", "out-of-scope", "test-file"]);
    expect(String(parsed.meta.scanned)).toBe(run.epilogue["scanned"]);
  },
  SPAWN_TIMEOUT_MS,
);

test(
  "a narrated real lens keeps stdout directly JSON-parseable",
  () => {
    const run = runAst(["registry-candidates", "--json", "--max", "1"], WHOLE_CORPUS_LENS_TIMEOUT_MS);
    expect(run.status).toBe(0);
    const parsed = JSON.parse(run.stdout) as { label: string; total: number; shown: number; hits: unknown[]; meta: { verb: string } };
    expect(parsed.label).toBe("registry-candidates");
    expect(parsed.total).toBeGreaterThan(0);
    expect(parsed.shown).toBe(1);
    expect(parsed.hits).toHaveLength(1);
    expect(parsed.meta.verb).toBe("registry-candidates");
    expect(run.stderr).toContain("registry-candidates is an INFORMATIONAL lens");
  },
  WHOLE_CORPUS_LENS_TIMEOUT_MS,
);

test(
  "the wide real corpus finds a coupled source and fixture literal",
  () => {
    const run = runAst(["literal", "chatDeleted"]);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("string-literal");
    expect(run.stdout).toContain("packages/");
    expect(run.stdout).toContain("tests/");
    expect(run.epilogue["scope"]).toContain("corpus:search-globs-no-types");
    expect(Number(run.epilogue["matches"])).toBeGreaterThan(0);
  },
  SPAWN_TIMEOUT_MS,
);

const ABSENT_LITERAL = ["nowhere", "AtAll", "9f3a1c"].join("_");

test(
  "the wide real corpus can prove an absent literal",
  () => {
    const run = runAst(["literal", ABSENT_LITERAL]);
    expect(run.status).toBe(0);
    expect(run.stdout).toBe(`RESULT ast literal ${ABSENT_LITERAL}: no results\n`);
    expect(Number(run.epilogue["scanned"])).toBeGreaterThan(0);
    expect(run.epilogue).toMatchObject({ matches: "0", status: "complete" });
  },
  SPAWN_TIMEOUT_MS,
);

test(
  "the typed CLI dispatches an absent dead-symbol query and closes its ledger",
  () => {
    const run = runAst(["dead", "thisSymbolExistsNowhereAtAllZzz"]);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("no declaration found");
    expect(run.epilogue).toMatchObject({ verb: "dead", status: "complete" });
  },
  SPAWN_TIMEOUT_MS,
);

test("a flag-shaped positional refuses before loading a workspace", () => {
  const run = runAst(["jsx", "--name", "Button"]);
  expect(run.status).toBe(3);
  expect(run.stderr).toContain("POSITIONALLY");
  expect(run.stderr).toContain("pnpm ast jsx Button");
  expect(run.stdout).not.toContain("RESULT ast jsx");
});

test("an unknown flag refuses before loading a workspace", () => {
  const run = runAst(["jsx", "Button", "--fles"]);
  expect(run.status).toBe(3);
  expect(run.stderr).toContain("--fles");
  expect(run.stdout).not.toContain("RESULT ast jsx");
});

test("a value flag cannot consume the following flag", () => {
  const run = runAst(["jsx", "Skeleton", "--in", "--json"]);
  expect(run.status).toBe(3);
  expect(run.stderr).toContain("--in");
  expect(run.stderr).toContain("--json");
  expect(run.stdout).not.toContain("RESULT ast jsx");
});

test("a final value flag refuses rather than defaulting", () => {
  const run = runAst(["jsx", "Skeleton", "--in"]);
  expect(run.status).toBe(3);
  expect(run.stderr).toContain("--in needs a value");
});

test("a nonnumeric max refuses rather than silently using the cap", () => {
  const run = runAst(["jsx", "Skeleton", "--max", "abc"]);
  expect(run.status).toBe(3);
  expect(run.stderr).toContain("--max needs a positive number");
});

test("a broken depcruise pass-through exits as a tool error", () => {
  const run = runAst(["flow", "("]);
  expect(run.status).toBe(2);
  expect(run.stderr).toContain("did NOT complete");
});

test("depcruise text pass-throughs explicitly refuse JSON mode", () => {
  const run = runAst(["flow", "packages/client", "--json"]);
  expect(run.status).toBe(3);
  expect(run.stderr).toContain("does not support --json");
  expect(run.stdout).toBe("");
});

test.each(["flow", "reaches"])("%s refuses JSON when the flag occupies the positional pattern slot", (verb) => {
  const run = runAst([verb, "--json"]);
  expect(run.status).toBe(3);
  expect(run.stderr).toContain("does not support --json");
  expect(run.stdout).toBe("");
});

test.each(["flow", "reaches"])("%s refuses JSON before a later module pattern", (verb) => {
  const run = runAst([verb, "--json", "packages/client"]);
  expect(run.status).toBe(3);
  expect(run.stderr).toContain("does not support --json");
  expect(run.stdout).toBe("");
});

test.each(["flow", "reaches"])("%s names its missing module pattern", (verb) => {
  const run = runAst([verb]);
  expect(run.status).toBe(3);
  expect(run.stderr).toContain("requires a module pattern");
  expect(run.stdout).toBe("");
});

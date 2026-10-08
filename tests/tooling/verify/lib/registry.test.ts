import { ACTIVE_GATES_INDEX_REL, SNAP_FLAGS_INDEX_REL } from "../../../../tooling/src/verify/contract/ledger-paths.ts";
import type { StageDef } from "../../../../tooling/src/verify/contract/stage.ts";
import { RUNNABLE_VERIFY_TIERS } from "../../../../tooling/src/verify/contract/stage.ts";
import { stagesForTier } from "../../../../tooling/src/verify/lib/registry.ts";
import { applyPathTriggers, WHOLE_COMMAND_PATH_TRIGGERS } from "../../../../tooling/src/verify/lib/registry-triggers.ts";
import { parseRequest } from "../../../../tooling/src/verify/lib/run-argv.ts";
import { stageLine } from "../../../../tooling/src/verify/lib/run-render.ts";
import { resolveSelection } from "../../../../tooling/src/verify/lib/selection.ts";
import { planStage } from "../../../../tooling/src/verify/lib/stage-plan.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const WHOLE_TIERS = RUNNABLE_VERIFY_TIERS;

test("automatic nonweekly tiers never admit checker recertification, even with unknown branch reach", () => {
  const proofs = new Set(["tests:tooling", "tests:instrument-affected", "tests:tool-guard", "structure:policy-conformance"]);
  for (const tier of RUNNABLE_VERIFY_TIERS.filter((candidate) => candidate !== "weekly")) {
    const planned = stagesForTier(tier).map((row) => ({ name: row.name, plan: planStage(row, undefined, tier, "/no-git-baseline") }));
    expect(
      planned.filter(({ name, plan }) => proofs.has(name) && plan.argv !== null),
      tier,
    ).toEqual([]);
  }
  expect(parseRequest(["--weekly"])).toMatchObject({ tier: "weekly", request: undefined });
});

test("product is exactly the complete full roster minus instrument proofs and mutation", () => {
  const excluded = ["quality:mutation-gate"];
  const full = stagesForTier("full");
  const product = stagesForTier("product");
  const retained = full.filter(({ name }) => !excluded.includes(name));
  expect(
    full
      .filter(({ name }) => excluded.includes(name))
      .map(({ name }) => name)
      .toSorted(),
  ).toEqual(excluded.toSorted());
  expect(product.map(({ name }) => name)).toEqual([
    "lint:biome",
    "lint:eslint",
    "lint:hook-syntax",
    "types:native",
    "types:testd",
    "types:ownership",
    "tests:execution-membership",
    "structure:db-baseline",
    "structure:asset-refs",
    "structure:drizzle-kit",
    "structure:agent-config",
    "structure:full",
    "ledgers:fresh",
    "release:showcase-versions",
    "config:biome-rule-liveness",
    "config:knip-negative-liveness",
    "imports:depcruise",
    "deps:knip",
    "deps:knip-prod",
    "deps:orphan-ratchet",
    "docs:format",
    "tests:node",
    "browser:ct",
    "browser:e2e-smoke",
    "quality:boot-chunk",
    "quality:cpd",
    "browser:e2e",
  ]);
  expect(product).toEqual(retained);
  for (const row of product) {
    expect(row).toBe(full.find(({ name }) => name === row.name));
    expect(planStage(row, undefined, "product")).toEqual({ mode: "full", argv: row.tierArgv?.product ?? row.argv, runsAt: null });
    expect(planStage(row, undefined, "full")).toEqual({ mode: "full", argv: row.argv, runsAt: null });
  }
  expect(product.filter(({ tierArgv }) => tierArgv !== undefined).map(({ name, tierArgv }) => [name, tierArgv])).toEqual([
    ["types:testd", { product: ["pnpm", "test:types", "--config=vitest.product.config.ts"] }],
  ]);
  expect(
    full
      .filter(({ name }) => !product.some((row) => row.name === name))
      .map(({ name }) => name)
      .toSorted(),
  ).toEqual(excluded.toSorted());
  const request = parseRequest(["--product"]);
  expect(request).toMatchObject({ tier: "product", request: undefined });
});

function stage(tier: Parameters<typeof stagesForTier>[0], name: string): StageDef {
  const found = stagesForTier(tier).find((row) => row.name === name);
  if (found === undefined) {
    throw new Error(
      `no stage named ${name} at tier ${tier}: ${stagesForTier(tier)
        .map((row) => row.name)
        .join(", ")}`,
    );
  }
  return found;
}

test("weekly owns the complete instrument battery and policy conformance without a second affected run", () => {
  expect(stagesForTier("weekly").map(({ name }) => name)).toEqual(["structure:policy-conformance", "tests:tooling"]);
  const row = stage("weekly", "tests:tooling");
  expect(row.argv).toEqual(["pnpm", "test:tooling"]);
  expect(row.classify(null)).toBe(2);
  expect(stage("manual", "tests:instrument-affected").argv).toEqual(["pnpm", "check:instrument-affected", "--weekly", "--affected"]);
  for (const flag of ["--changed", "--file", "--package=tooling", "--scope=tooling/src"]) {
    expect(parseRequest(["--weekly", flag, ...(flag === "--file" ? ["package.json"] : [])])).toHaveProperty("error");
  }
});

test("tests:node stays the push bar for everything else, and no longer carries the tooling battery", () => {
  // `pnpm test:node`'s project list is what makes the exclusion real; the row's argv is the pointer to it.
  // The argv changed in #1848: this stage was `pnpm test`, the COMPOSITE that also ran the whole CT suite,
  // and the two halves shared one 45-minute hang ceiling that the sum outgrew (a false `[tool-error]` on a
  // quiet box). CT is now the sibling `browser:ct` stage with its own profile-derived ceiling; `pnpm test`
  // survives untouched as the explicit product-test command and manual `tests:product-composite` row.
  expect(stage("push", "tests:node").argv).toEqual(["pnpm", "test:node"]);
  expect(stagesForTier("push").some((row) => row.name === "tests:node")).toBe(true);
  // Native collection, not a copied project roster, proves the product-only automatic population.
  expect(stage("changed", "tests:node").scopedArgv).toBeTypeOf("function");
});

test("policy conformance cannot be decorated back into an automatic scope", () => {
  const row = stage("weekly", "structure:policy-conformance");
  expect(row.scopedArgv).toBeUndefined();
  expect(row.classify(2)).toBe(2);
  expect(WHOLE_COMMAND_PATH_TRIGGERS["structure:policy-conformance"]).toBeUndefined();
  expect(WHOLE_COMMAND_PATH_TRIGGERS["tests:instrument-affected"]).toBeUndefined();
  const collision = { ...row, name: "types:testd" };
  expect(applyPathTriggers([collision])).toEqual([collision]);
});

// A markdown-only change owes none of the near-identity stages: no type, Biome grant or ledger reads a doc. The
// controls keep the admission complete: a markdown LEDGER, every source and config path, and a `.md`-lookalike.
test("the near-identity triggers skip a markdown-only change and still admit every input they read", () => {
  const trigger = (name: string): RegExp => {
    const paths = WHOLE_COMMAND_PATH_TRIGGERS[name]?.paths;
    if (paths === undefined || paths === null) {
      throw new Error(`${name} has no path trigger`);
    }
    return paths;
  };
  const nearIdentity = ["types:testd", "config:biome-rule-liveness", "ledgers:fresh"] as const;
  for (const name of nearIdentity) {
    for (const doc of ["docs/adr/0267-the-commit-and-push-gates-judge-a-snapshot.md", "README.md", "docker/README.md"]) {
      expect(trigger(name).test(doc), `${name} skips ${doc}`).toBe(false);
    }
    for (const input of [
      "packages/server/src/entry/lifecycle.ts",
      "tests/types/share.test-d.ts",
      "packages/ui/src/tokens/tokens.json",
      "biome.json",
      "pnpm-lock.yaml",
      "tooling/src/doc/lib/notes.md.ts",
    ]) {
      expect(trigger(name).test(input), `${name} admits ${input}`).toBe(true);
    }
  }
  for (const ledger of [ACTIVE_GATES_INDEX_REL, SNAP_FLAGS_INDEX_REL]) {
    expect(trigger("ledgers:fresh").test(ledger), `ledgers:fresh admits the markdown ledger ${ledger}`).toBe(true);
    expect(trigger("types:testd").test(ledger)).toBe(false);
  }
});

test("#2303 — every whole-only static stage must have an explicit trigger-table decision", () => {
  const unaccounted: StageDef = {
    name: "structure:unaccounted",
    group: "structure",
    tiers: ["static"],
    argv: ["pnpm", "check:unaccounted"],
    classify: () => 0,
  };
  expect(() => applyPathTriggers([unaccounted])).toThrow("whole-only static stage is absent from WHOLE_COMMAND_PATH_TRIGGERS: structure:unaccounted");
});

test("mutation:arid is a discoverable manual report-input tool, never an automatic tier", () => {
  const row = stagesForTier("manual").find((candidate) => candidate.name === "quality:mutation-arid");
  expect(row).toMatchObject({
    group: "quality",
    tiers: ["manual"],
    argv: ["pnpm", "mutation:arid"],
  });
  expect(row?.manualReason).toContain("existing Stryker JSON report path");
  expect(row?.classify(2), "an unreadable report is a tool error").toBe(2);
  expect(row?.classify(3), "missing report arguments are misuse").toBe(3);
  for (const tier of WHOLE_TIERS) {
    expect(stagesForTier(tier).some((candidate) => candidate.name === "quality:mutation-arid")).toBe(false);
  }
});

test("quality:cpd preserves the wrapped tool's clean, violation, and non-verdict exits", () => {
  const row = stage("push", "quality:cpd");
  expect(row.classify(0)).toBe(0);
  expect(row.classify(1)).toBe(1);
  expect(row.classify(2)).toBe(2);
  expect(row.classify(null)).toBe(2);
});

test("NO row hangs on a tier precondition today — the mechanism is unused DATA, not a live rung", () => {
  // #1523 minted `tierPrecondition` for the conditional push rung; #1842 removed the rung. The field is
  // still in the contract (contract/stage.ts) and the runner still honours it (ops/run.ts, pinned by
  // tests/tooling/verify/ops/run.int.test.ts against a synthetic row) — but a CONDITIONAL membership that
  // nobody declares must not silently reappear: if a row grows one, that is a ladder change, and this arm
  // makes it a deliberate edit rather than a quiet one.
  for (const tier of WHOLE_TIERS) {
    for (const row of stagesForTier(tier)) {
      expect(row.tierPrecondition, `${row.name} declares a tier precondition at ${tier}`).toBeUndefined();
    }
  }
});

// #1566: `skipped` carries TWO different facts and the console printed only one of them. A scoped skip
// means the selection held no relevant file; a tier-precondition skip is a WHOLE-tier run, where "no files
// in scope" is simply false — and the reader deciding whether their push was really covered is reading
// this line, not verify.json. The renderer keeps both spellings even though no row declares a precondition
// today: the runner path is live and the words are what a future rung would print.
test("a tier-precondition skip says so and names the tier that DOES run it; a scoped skip is unchanged", () => {
  const base = {
    name: "tests:tooling",
    group: "tests",
    mode: "skipped",
    ok: true,
    exitCode: 0,
    durationMs: 0,
    logFile: null,
    failureExcerpt: null,
    notices: [],
  } as const;

  expect(stageLine({ ...base, runsAt: "verify --full" })).toContain("skipped — tier precondition not met; runs at verify --full");
  // THE CONTROL: `runsAt: null` is what a SCOPED skip carries, and its wording must not have moved.
  expect(stageLine({ ...base, name: "lint:eslint", group: "lint", runsAt: null })).toContain("skipped (no files in scope)");
});

// Each selection reads the repository inventory, so the budget is a spawn budget.
test("docs:format at a scoped tier checks every changed markdown file the whole check would", { timeout: scaledBudget(20_000) }, () => {
  const docsFormat = stage("changed", "docs:format");
  const argvFor = (paths: readonly string[]): unknown => docsFormat.scopedArgv?.(resolveSelection({ kind: "changed", paths }));
  // An instruction file sits outside the docs trees but inside `check:docs`: the scoped run must not skip it.
  expect(argvFor([".claude/skills/orchestrator/SKILL.md"]), "a skill file owes the whole markdown check").toEqual(["pnpm", "check:docs"]);
  expect(argvFor(["docs/law/Constitution.md"]), "a docs-tree file keeps the narrowed check").toEqual([
    "node",
    "tooling/src/doc/cli.ts",
    "format",
    "--check",
    "docs/law/Constitution.md",
  ]);
  expect(argvFor(["lefthook.yml"]), "no markdown, nothing owed").toBe("skip-empty");
});

test("application subject requests are explicit for static, implicit only for whole product tiers, and never weekly or scoped", () => {
  expect(parseRequest(["--static", "--application"])).toMatchObject({ tier: "static", applicationOnly: true, request: undefined });
  expect(parseRequest(["--static"])).toMatchObject({ applicationOnly: false });
  for (const tier of ["push", "full", "product"]) {
    expect(parseRequest([`--${tier}`])).toMatchObject({ applicationOnly: true });
  }
  for (const tier of ["push", "full"]) {
    expect(parseRequest([`--${tier}`, "--file", "package.json"])).toMatchObject({ applicationOnly: false });
  }
  for (const args of [["--weekly"], ["--changed"], ["--file", "package.json"], ["--package=server"], ["--scope=packages/server"]]) {
    expect(parseRequest(["--application", ...args])).toHaveProperty("error");
  }
});

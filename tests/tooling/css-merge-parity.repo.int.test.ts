// Stable Tailwind compilation is the utility-family authority. Exact class evidence comes from #961's
// shared producer/consumer walker; compiled-output parity repeats the production @source-shaped Oxide scan.
// This test owns no expression resolver or CSS parser, and pins plain @theme against unused-token loss.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CSS_MERGE_FAMILY_NAMES } from "@orb/ui/lib";
// Devtime build/verify machinery at the @orb/ui package ROOT — no `exports` subpath by design (#1847).
import { assertTokenContract } from "@orb/ui/token-contract";
import { Scanner } from "@tailwindcss/oxide";
import { compile } from "tailwindcss";
import type { SourceFile } from "ts-morph";
import { getWorkspace } from "../../tooling/src/_shared/ts-workspace.ts";
import { walkStaticClassExpressions } from "../../tooling/src/verify/lib/static-class-expression.ts";
import { expect, test } from "../support/tool-fixtures.ts";

interface CompilerFamilyProbe {
  readonly family: string;
  readonly candidate: string;
}

interface ProductionCandidates {
  readonly files: number;
  readonly candidates: readonly string[];
}

interface ExactStaticEvidence extends ProductionCandidates {
  readonly roots: number;
  readonly staticValues: number;
}

const ROOT = join(import.meta.dirname, "../..");
const UI_ROOT = join(ROOT, "packages/ui");
const THEME_CSS = readFileSync(join(UI_ROOT, "src/styles/theme.css"), "utf8");
const TOKEN_CONTRACT = assertTokenContract(UI_ROOT);
const PRODUCT_GLOBS = [
  `${ROOT}/packages/ui/src/**/*.ts`,
  `${ROOT}/packages/ui/src/**/*.tsx`,
  `${ROOT}/packages/client/src/**/*.ts`,
  `${ROOT}/packages/client/src/**/*.tsx`,
];

// One row for every contract-derived @theme namespace. Compilation, not the prefix, decides whether
// the family is governed; dimension/z and the other bespoke prefixes are negative controls.
const FAMILY_PROBES: readonly CompilerFamilyProbe[] = [
  { family: "color", candidate: "bg-primary" },
  { family: "spacing", candidate: "gap-block" },
  { family: "radius", candidate: "rounded-base" },
  { family: "dimension", candidate: "w-rail" },
  { family: "shadow", candidate: "shadow-glow" },
  { family: "blur", candidate: "blur-strength" },
  { family: "immersive", candidate: "w-echo-art-width" },
  { family: "reading", candidate: "max-w-measure" },
  { family: "fade", candidate: "fade-edge-stop" },
  { family: "border-width", candidate: "border-hairline" },
  { family: "font", candidate: "font-sans" },
  { family: "text", candidate: "text-title" },
  { family: "leading", candidate: "leading-title" },
  { family: "container", candidate: "max-w-cq-sm" },
  { family: "width", candidate: "w-dialog-sm" },
  { family: "z", candidate: "z-overlay" },
  { family: "motion", candidate: "duration-fast" },
  { family: "ease", candidate: "ease-out-expo" },
  { family: "aspect", candidate: "aspect-portrait" },
  { family: "tracking", candidate: "tracking-micro" },
];

function exactStaticEvidence(files: readonly SourceFile[]): ExactStaticEvidence {
  if (files.length === 0) {
    throw new Error("INSTRUMENT ERROR: CSS exact provenance loaded zero source files");
  }
  const walked = walkStaticClassExpressions(files);
  if (walked.roots === 0 || walked.candidates.length === 0) {
    throw new Error(`INSTRUMENT ERROR: CSS static provenance found ${walked.roots} roots and ${walked.candidates.length} values`);
  }
  const scanner = new Scanner({ sources: [] });
  const candidates = new Set<string>();
  for (const value of walked.candidates) {
    if ((value.value.length > 0 && value.segments.length === 0) || value.consumers.length === 0) {
      throw new Error("INSTRUMENT ERROR: CSS static evidence lost its producer or consumer");
    }
    for (const scanned of scanner.getCandidatesWithPositions({ content: value.value, extension: "html" })) {
      candidates.add(scanned.candidate);
    }
  }
  if (candidates.size === 0) {
    throw new Error("INSTRUMENT ERROR: Tailwind scanner produced zero exact candidates");
  }
  return { files: files.length, roots: walked.roots, staticValues: walked.candidates.length, candidates: [...candidates] };
}

function productionCandidates(sources: readonly { readonly base: string; readonly pattern: string; readonly negated: boolean }[]): ProductionCandidates {
  if (sources.length === 0) {
    throw new Error("INSTRUMENT ERROR: CSS production scanner has zero source roots");
  }
  const scanner = new Scanner({ sources: [...sources] });
  const candidates = scanner.scan();
  if (scanner.files.length === 0 || candidates.length === 0) {
    throw new Error(`INSTRUMENT ERROR: CSS production scan found ${scanner.files.length} files and ${candidates.length} candidates`);
  }
  return { files: scanner.files.length, candidates };
}

function contractThemeTargets(): readonly string[] {
  if (TOKEN_CONTRACT.scannedTokens === 0) {
    throw new Error("INSTRUMENT ERROR: token contract has zero population");
  }
  const targets = TOKEN_CONTRACT.baseTokens.filter((token) => token.outputRole !== "input").map((token) => `--${token.path.join("-")}`);
  for (const [target, entry] of Object.entries(TOKEN_CONTRACT.cssValues)) {
    if (entry.placement === "theme") {
      targets.push(target);
    }
  }
  return [...new Set(targets)].sort();
}

function contractThemeFamilies(): readonly string[] {
  const families = new Set<string>();
  for (const token of TOKEN_CONTRACT.baseTokens) {
    if (token.outputRole !== "input" && token.path[0] !== undefined) {
      families.add(token.path[0]);
    }
  }
  for (const [target, entry] of Object.entries(TOKEN_CONTRACT.cssValues)) {
    if (entry.placement !== "theme") {
      continue;
    }
    const matches = FAMILY_PROBES.filter((probe) => target.startsWith(`--${probe.family}-`));
    const match = matches[0];
    if (match === undefined || matches.length !== 1) {
      throw new Error(`INSTRUMENT ERROR: theme target ${target} maps to ${matches.length} compiler probe families`);
    }
    families.add(match.family);
  }
  return [...families].sort();
}

function familyParity(compilerFamilies: readonly string[], registeredFamilies: readonly string[]): { missing: string[]; bogus: string[] } {
  const compilerSet = new Set(compilerFamilies);
  const registeredSet = new Set(registeredFamilies);
  return {
    missing: compilerFamilies.filter((family) => !registeredSet.has(family)).sort(),
    bogus: registeredFamilies.filter((family) => !compilerSet.has(family)).sort(),
  };
}

const PROJECT = getWorkspace({ root: ROOT, globs: PRODUCT_GLOBS });
const EXACT = exactStaticEvidence(PROJECT.getSourceFiles());
const PRODUCTION_SOURCES = [
  { base: join(ROOT, "packages/client/src"), pattern: "**/*", negated: false },
  { base: join(ROOT, "packages/ui/src"), pattern: "**/*", negated: false },
] as const;
const PRODUCTION = productionCandidates(PRODUCTION_SOURCES);
const COMPILER = await compile(`${THEME_CSS}\n@tailwind utilities;`);
const COMPILED_CSS = COMPILER.build([...PRODUCTION.candidates, ...FAMILY_PROBES.map(({ candidate }) => candidate)]);
const COMPILER_FAMILIES = FAMILY_PROBES.filter(({ candidate }) => COMPILED_CSS.includes(`.${candidate} {`)).map(({ family }) => family);

test(`the #961 evidence is populated (${EXACT.files} files / ${EXACT.roots} roots / ${EXACT.staticValues} exact values)`, () => {
  expect(EXACT).toMatchObject({
    files: expect.any(Number),
    roots: expect.any(Number),
    staticValues: expect.any(Number),
    candidates: expect.arrayContaining(["aspect-portrait", "blur-(--blur-strength)", "ease-out-expo"]),
  });
  expect(EXACT.files).toBeGreaterThan(0);
  expect(EXACT.roots).toBeGreaterThan(0);
  expect(EXACT.staticValues).toBeGreaterThan(0);
  expect(EXACT.candidates.length).toBeGreaterThan(0);
});

test(`the production-shaped Oxide scan is populated (${PRODUCTION.files} files / ${PRODUCTION.candidates.length} candidates)`, () => {
  expect(PRODUCTION.files).toBeGreaterThan(0);
  expect(PRODUCTION.candidates.length).toBeGreaterThan(0);
});

test("the compiler probe covers every contract-derived @theme namespace", () => {
  expect(contractThemeFamilies()).toStrictEqual(FAMILY_PROBES.map(({ family }) => family).sort());
});

test("stable compilation emits every generated theme target from production-shaped candidates", () => {
  const targets = contractThemeTargets();
  expect(targets.length, "INSTRUMENT ERROR: generated theme target population is zero").toBeGreaterThan(0);
  expect(targets.filter((target) => !COMPILED_CSS.includes(`${target}:`))).toStrictEqual([]);
});

test("compiler-positive families and Orb's governed merge registry are set-equal both ways", () => {
  expect(familyParity(COMPILER_FAMILIES, CSS_MERGE_FAMILY_NAMES)).toStrictEqual({ missing: [], bogus: [] });
});

test("parity controls fail for one omitted positive family and one bogus registration", () => {
  expect(
    familyParity(
      COMPILER_FAMILIES,
      CSS_MERGE_FAMILY_NAMES.filter((family) => family !== "aspect"),
    ),
  ).toStrictEqual({
    missing: ["aspect"],
    bogus: [],
  });
  expect(familyParity(COMPILER_FAMILIES, [...CSS_MERGE_FAMILY_NAMES, "z"])).toStrictEqual({ missing: [], bogus: ["z"] });
});

test("zero source population fails loud before static provenance can return a false clean", () => {
  expect(() => exactStaticEvidence([])).toThrow("INSTRUMENT ERROR: CSS exact provenance loaded zero source files");
  expect(() => productionCandidates([])).toThrow("INSTRUMENT ERROR: CSS production scanner has zero source roots");
});

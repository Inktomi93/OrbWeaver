// Tailwind compilation and the production-shaped Oxide scan establish utility-family and token emission parity.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
// Devtime build/verify machinery at the @orb/ui package ROOT — no `exports` subpath by design (#1847).
import { assertTokenContract } from "@orb/ui/token-contract";
import { Scanner } from "@tailwindcss/oxide";
import { compile } from "tailwindcss";
import { CSS_MERGE_FAMILY_NAMES } from "#ui/lib/class-merge.ts";

interface CompilerFamilyProbe {
  readonly family: string;
  readonly candidate: string;
}

interface ProductionCandidates {
  readonly files: number;
  readonly candidates: readonly string[];
}

const ROOT = join(import.meta.dirname, "../..");
const UI_ROOT = join(ROOT, "packages/ui");
const THEME_CSS = readFileSync(join(UI_ROOT, "src/styles/theme.css"), "utf8");
const TOKEN_CONTRACT = assertTokenContract(UI_ROOT);
// One row for every contract-derived @theme namespace. Compilation, not the prefix, decides whether
// the family is governed; dimension/z and the other bespoke prefixes are negative controls.
const FAMILY_PROBES: readonly CompilerFamilyProbe[] = [
  { family: "color", candidate: "bg-primary" },
  { family: "spacing", candidate: "gap-block" },
  { family: "size", candidate: "size-control-sm" },
  { family: "primitive", candidate: "p-space-8" },
  { family: "breakpoint", candidate: "w-shell" },
  { family: "radius", candidate: "rounded-base" },
  { family: "dimension", candidate: "w-rail" },
  { family: "shadow", candidate: "shadow-glow" },
  { family: "blur", candidate: "blur-strength" },
  { family: "immersive", candidate: "w-echo-art-width" },
  { family: "reading", candidate: "max-w-measure" },
  { family: "fade", candidate: "fade-edge-stop" },
  { family: "border-width", candidate: "border-hairline" },
  { family: "font", candidate: "font-sans" },
  { family: "font-weight", candidate: "font-medium" },
  { family: "height", candidate: "h-scroll-md" },
  { family: "grid", candidate: "grid-cols-lead" },
  { family: "text", candidate: "text-title" },
  { family: "leading", candidate: "leading-title" },
  { family: "container", candidate: "max-w-cq-24" },
  { family: "width", candidate: "w-dialog-sm" },
  { family: "z", candidate: "z-overlay" },
  { family: "motion", candidate: "duration-fast" },
  { family: "ease", candidate: "ease-out-expo" },
  { family: "aspect", candidate: "aspect-portrait" },
  { family: "tracking", candidate: "tracking-micro" },
];

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

const PRODUCTION_SOURCES = [
  { base: join(ROOT, "packages/client/src"), pattern: "**/*", negated: false },
  { base: join(ROOT, "packages/ui/src"), pattern: "**/*", negated: false },
] as const;
const PRODUCTION = productionCandidates(PRODUCTION_SOURCES);
const COMPILER = await compile(`${THEME_CSS}\n@tailwind utilities;`);
const COMPILED_CSS = COMPILER.build([...PRODUCTION.candidates, ...FAMILY_PROBES.map(({ candidate }) => candidate)]);
const COMPILER_FAMILIES = FAMILY_PROBES.filter(({ candidate }) => COMPILED_CSS.includes(`.${candidate} {`)).map(({ family }) => family);

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

test("zero source population refuses before production scanning", () => {
  expect(() => productionCandidates([])).toThrow("INSTRUMENT ERROR: CSS production scanner has zero source roots");
});

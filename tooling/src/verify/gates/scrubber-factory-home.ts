// Policy: scrubber-factory-home — the DEFINITION half of the §3.6 member-strip trust boundary, split off
// `scrubber-home` at the #1584 conversion because the two arms differ on AUTHORITY.
//
// `scrubber-home` says "only the producer stamp may reach the hidden-span scrubber factory", and it says it
// by resolving every reference against the factory's declaration home. That claim has a silent failure mode
// with no reference in it at all: if `packages/kit/src/content/` stops EXPORTING
// `createHiddenSpanStreamScrubber` — renamed, moved to a sibling directory, or folded into another module —
// then every reference on the tree resolves somewhere else, `scrubber-home` finds nothing, and a rule about
// a stateful trust boundary renders a clean pass over a subject it no longer has. That is the legacy MODE A
// arm for the kit zone, and it is a COMPLETENESS claim about a definition site rather than a permission:
// there is nothing here to grant and nothing to waive, so the authority is `hard`.
//
// TWO DISTINCT FAILURES, BOTH LOUD. The content directory holding no source at all takes the population
// receipt to zero members and REFUSES the run (the directory moved). The directory existing while none of
// its modules exports the factory is a FINDING (the export moved or was renamed). Neither can be silenced.
//
// FAMILY `scrubber-home` — the shared computation is the factory's declaration home
// (`scrubber-home.ts`'s `SCRUBBER_SYMBOL` + `SCRUBBER_HOME.pathInfix`), re-stated here as `SCRUBBER_SYMBOL`
// + `HOME_INFIX` because the two halves of one trust boundary must name the SAME directory or this
// completeness arm stops covering the reference policy. The split is by AUTHORITY — reviewed-grant
// permission there, hard completeness here — which the contract requires to be two policy ids under one
// `family` string. This policy resolves no origin at all and consumes no shared reader; that is the
// SPLIT'S point, not a thin contract.
// POPULATION PORT: this policy has NO legacy population of its own — it did not exist at `9808b93c0^`
// (`git show 9808b93c0^:tooling/src/verify/gates/scrubber-factory-home.ts` → `exists on disk, but not in`).
// It is the DEFINITION half carved out of `scrubber-home`'s legacy `PACKAGES_SRC` scan at the conversion,
// and `@kit` (`packages/kit/src/`) is the narrowest population that contains the declaration home the
// carved-out arm judges. Nothing was subtracted from `scrubber-home`'s side to make room for it: the kit
// directory stays in that policy's population too, where it is now SCANNED rather than excused.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `scrubber-home` descriptor at 123b36f453318217b33a76d6e7ffb0ff15288f06, the parent of the conversion `9808b93c0`;
// this module did not exist there, so it is measured against the module it was carved from, `scrubber-home` (blob
// read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME 7,219 harness
// candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot` admits 3,372
// and final `population` admits 61. legacy − final = 3,311 `packages/*/src` sources outside `@kit` — the parent's
// reference scan; this carved completeness arm reads only the definition home. final − legacy = ∅. Controls: inside
// `packages/kit/src/assets/__cbbhr_in_index.ts` (virtual) admitted by both; outside
// `scripts/codemods/__cbbhr_out_rename-roster-participants.ts` (virtual) rejected by both.
import type { SourceFile } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

const SCRUBBER_SYMBOL = "createHiddenSpanStreamScrubber";
const HOME_INFIX = "/packages/kit/src/content/";
const HOME_RECEIPT = "kit content home";

const MESSAGE =
  "the kit content home no longer EXPORTS `createHiddenSpanStreamScrubber` — the hidden-span scrubber's " +
  "declaration site is what `scrubber-home` resolves every reference against, so a rename or a move here " +
  "silently retires that trust boundary rather than breaking it (§3.6, ed2aafc5).";
const FIX =
  "keep the stateful hidden-span scrubber factory exported from packages/kit/src/content/, or move `scrubber-home`'s declared home with it in the same commit.";

function isHomeFile(file: SourceFile): boolean {
  return file.getFilePath().replaceAll("\\", "/").includes(HOME_INFIX);
}

export const gate = defineGate({
  id: "scrubber-factory-home",
  family: "scrubber-home",
  authority: "hard",
  severity: "error",
  population: "@kit",
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    evaluate: () => {
      const home = ctx.files.filter(isHomeFile);
      // The receipt REFUSES at zero: a content directory that holds no source is a moved home, and a
      // completeness policy cannot render a verdict over a population it could not resolve.
      ctx.receipt({ kind: "population", source: HOME_RECEIPT, members: home.length, unresolved: 0 });
      const declaring = home.filter((file) => file.getExportedDeclarations().has(SCRUBBER_SYMBOL));
      const anchor = home[0];
      if (declaring.length === 0 && anchor !== undefined) {
        ctx.report.file(ctx.relativePath(anchor), { message: MESSAGE, fix: FIX });
      }
    },
  }),
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/kit/src/content/index.ts": "export function stripHiddenSpans(text: string): string {\n  return text;\n}\n",
      },
      expect: { count: 1 },
      why: "THE FOUNDING SHAPE: the content home still exists and still exports content helpers, but the stateful scrubber factory is gone — which is exactly the state in which `scrubber-home` resolves nothing and passes everything",
    },
    {
      mode: "types",
      files: {
        "packages/kit/src/content/index.ts": "export function stripHiddenSpans(text: string): string {\n  return text;\n}\n",
        "packages/kit/src/content/spans.ts": "export function createHiddenSpanStreamScrubberV2(): null {\n  return null;\n}\n",
      },
      expect: { count: 1 },
      why: "A RENAME is the same silent retirement — a NEAR-MISS export in the same home does not satisfy the claim, because `scrubber-home` resolves against this exact name",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/kit/src/content/index.ts":
          "export function createHiddenSpanStreamScrubber(): { readonly push: (text: string) => string } {\n  return { push: (text) => text };\n}\n",
      },
      why: "the live shape — the factory is declared and exported by the content home, so the boundary `scrubber-home` enforces has a subject",
    },
    {
      mode: "types",
      files: {
        "packages/kit/src/content/spans.ts":
          "export function createHiddenSpanStreamScrubber(): { readonly push: (text: string) => string } {\n  return { push: (text) => text };\n}\n",
        "packages/kit/src/content/index.ts": 'export { createHiddenSpanStreamScrubber } from "./spans.ts";\n',
      },
      why: "an INTERNAL SPLIT of the home is legal: the claim is about the DIRECTORY, so moving the declaration to a sibling module inside it — re-exported or not — keeps `scrubber-home`'s path infix true",
    },
    {
      mode: "types",
      files: {
        "packages/kit/src/content/index.ts":
          "export function createHiddenSpanStreamScrubber(): { readonly push: (text: string) => string } {\n  return { push: (text) => text };\n}\n",
        "packages/kit/src/time/index.ts": "export function nowMs(): number {\n  return 0;\n}\n",
      },
      why: "an unrelated kit module in the same population does not disturb the claim — the home filter is a path infix, not the whole package",
    },
  ],
});

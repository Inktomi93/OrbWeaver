// Policy: context-definition-shape-health — the two SINGLE-WRITER arms of the CONTEXT pane's head band
// (family `context-definition-shape`; the family, §12.7 and marker receipts are recorded on the
// occurrence sibling). Arm 6: at most ONE `defineContextRegion(` call site project-wide — one pane's head
// band has ONE owner, and a second claimant makes "which one wins" a declaration-order accident at the
// seam that decides what the panel's head looks like. Arm 8: at most ONE writer of the
// `data-context-bracket` probe attribute, so a geometry probe can never resolve to two different
// elements, and a second column composition is exactly the fork #860 ended (hud-home-spec §8).
//
// WHY THESE TWO SPLIT OUT, and it is mechanism rather than taste. They are COUNT arms: the verdict is
// "how many exist across the whole tree", which cannot compose over an arbitrary selected subset, so they
// are `execution: "entire-population"` while the other six arms are per-file `selected-files` — and one
// execution per descriptor (§12.1) makes the split mandatory. The legacy module carried both in a
// `finalize` guarded by `ctx.scope.kind !== "project"`, a hand-rolled self-guard that the contract now
// owns: a narrowed request DEFERS an `entire-population` policy instead of letting it render a false
// single-writer verdict over a fragment.
//
// `authority: "hard"` is the second half of the split. A count arm has no per-occurrence door to offer —
// the finding is reported at EVERY participating site, so "waiving one" is meaningless and waiving all of
// them is just turning the invariant off. Hard also removes the position-token question: an ordinary
// finding must carry authored text at its own line/column (`lib/ordinary-waiver.ts:394`), and the site of
// a "there are two of these" verdict has no such token. The legacy arms reported a `{file, line,
// column: 0}` triple with no token at all, which would have raised a binding failure on the first waiver.
//
// ARMS 6 AND 8 ARE COUNT-BASED, NOT PATH-KEYED, and that is deliberate: a path allowlist dies silently
// the day the file is renamed, while "at most one" survives any rename and enforces the same invariant.
//
// DECLARED BLIND SPOT, carried from the legacy descriptor: both arms read LITERAL shapes. A claim
// assembled through a variable, a re-export or a computed property is invisible to them — the HUD-1 §10
// CTs are the required second lens, not a nice-to-have.
//
// LEGACY SHA: aa8cf0d53 (`git show aa8cf0d53:tooling/src/verify/gates/context-definition-shape.ts`,
// `collectRegionMintSites` / `collectRegionHostSites` / `reportExtraSites`).
import type { SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { DEFINE_CONTEXT_REGION, REGION_ATTR, REGISTRY_CONTRACTS_RE } from "../lib/context-definition-shape.ts";

interface CountedSite {
  readonly path: string;
  readonly line: number;
}

const MESSAGE =
  "the CONTEXT pane's head band has more than one writer — a SECOND `defineContextRegion(` call site, or a " +
  `SECOND writer of the \`${REGION_ATTR}\` probe attribute (hud-home-spec §8 arms 6 and 8).`;
const SECOND_MINT_MESSAGE =
  "a SECOND `defineContextRegion(` call site — one CONTEXT pane's head band has ONE owner (hud-home-spec §8 " +
  "arm 6). A second claimant makes 'which one wins' a declaration-order accident at the seam that decides " +
  "what the panel's head looks like.";
const SECOND_BRACKET_MESSAGE =
  `a SECOND writer of \`${REGION_ATTR}\` — the probe attribute has ONE writer (the context bracket), so a ` +
  "geometry probe can never resolve to two different elements, and a second column composition is exactly " +
  "the fork #860 ended (hud-home-spec §8 arm 8).";

export const gate = defineGate({
  id: "context-definition-shape-health",
  family: "context-definition-shape",
  authority: "hard",
  severity: "error",
  population: "@client",
  analysis: "syntax",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  create: (ctx) => {
    const mintSites: CountedSite[] = [];
    const hostSites: CountedSite[] = [];
    const at = (node: { getStartLineNumber: () => number }, sourceFile: SourceFile): CountedSite => ({
      path: ctx.relativePath(sourceFile),
      line: node.getStartLineNumber(),
    });
    return {
      visitors: [
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node, sourceFile): void => {
            if (REGISTRY_CONTRACTS_RE.test(sourceFile.getFilePath())) {
              return;
            }
            if (Node.isCallExpression(node) && node.getExpression().getText() === DEFINE_CONTEXT_REGION) {
              mintSites.push(at(node, sourceFile));
            }
          },
        },
        {
          kinds: [SyntaxKind.JsxAttribute],
          visit: (node, sourceFile): void => {
            if (Node.isJsxAttribute(node) && node.getNameNode().getText() === REGION_ATTR) {
              hostSites.push(at(node, sourceFile));
            }
          },
        },
      ],
      evaluate: (): void => {
        for (const [sites, message] of [
          [mintSites, SECOND_MINT_MESSAGE],
          [hostSites, SECOND_BRACKET_MESSAGE],
        ] as const) {
          if (sites.length > 1) {
            for (const site of sites) {
              ctx.report.file(site.path, { line: site.line, message });
            }
          }
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "source",
      files: {
        "packages/client/src/features/rpg/lib/rpg-hud-region.tsx":
          "declare function defineContextRegion<S>(def: unknown): unknown;\n" +
          'export const a = defineContextRegion({ id: "a", claims: () => true, band: () => null });\n',
        "packages/client/src/features/crew/lib/crew-hud-region.tsx":
          "declare function defineContextRegion<S>(def: unknown): unknown;\n" +
          'export const b = defineContextRegion({ id: "b", claims: () => true, band: () => null });\n',
      },
      expect: { count: 2, line: 2, messageIncludes: "SECOND `defineContextRegion(` call site" },
      why: "arm 6 — two claimants project-wide; one pane's head has one owner. BOTH sites are reported, not just the later one: with a count verdict there is no innocent party, and naming only one would tell the reader to delete the wrong file",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/app-shell/components/context-bracket.tsx": "export const a = <div data-context-bracket={true} />;\n",
        "packages/client/src/features/rpg/components/rpg-hud-band.tsx": "export const b = <div data-context-bracket={true} />;\n",
      },
      expect: { count: 2, line: 1, messageIncludes: `SECOND writer of \`${REGION_ATTR}\`` },
      why: "arm 8 — two writers of the bracket probe attribute (a second column composition). Both sites reported, same reasoning as arm 6",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "packages/client/src/features/rpg/lib/rpg-hud-region.tsx":
          "declare function defineContextRegion<S>(def: unknown): unknown;\n" +
          'export const hud = defineContextRegion({ id: "rpg.hud", claims: () => true, band: () => null });\n',
        "packages/client/src/features/app-shell/components/context-bracket.tsx": "export const host = <div data-context-bracket={true} />;\n",
      },
      why: "THE SANCTIONED SHAPE: exactly ONE minted band claim and exactly ONE bracket writer. This is also the `> 1` threshold's own row — lower it to `> 0` and this row is the one that dies",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/lib/registry-contracts.ts":
          "declare function defineContextRegion<S>(def: unknown): unknown;\n" +
          'export const mintExample = defineContextRegion({ id: "x", claims: () => true, band: () => null });\n',
        "packages/client/src/features/rpg/lib/rpg-hud-region.tsx":
          "declare function defineContextRegion<S>(def: unknown): unknown;\n" +
          'export const hud = defineContextRegion({ id: "rpg.hud", claims: () => true, band: () => null });\n',
      },
      why: "THE MINT-FILE EXEMPTION, pinned: a `defineContextRegion(` call inside `lib/registry-contracts.ts` is the mint's own home and is not a CLAIMANT, so it does not count toward the one-owner budget. Drop `REGISTRY_CONTRACTS_RE` from the call visitor and this row reports twice — it is the only row that dies",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/anchor.ts": "export const anchor = 1;\n",
        "packages/server/src/domain/x/verbs/x.ts":
          "declare function defineContextRegion<S>(def: unknown): unknown;\n" +
          'export const a = defineContextRegion({ id: "a", claims: () => true, band: () => null });\n' +
          'export const b = defineContextRegion({ id: "b", claims: () => true, band: () => null });\n',
      },
      why: 'THE POPULATION FENCE, pinned: two region mints in `@server` are not this policy\'s subject — the CONTEXT pane is a client surface. Drop `population: "@client"` and this is the only row that dies. The clean client `anchor.ts` beside it is mandatory: a fence falsifier whose only file sits outside the population admits zero paths and tool-errors instead of reporting',
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/rpg/components/rpg-hud-band.tsx":
          'export const a = <div data-context-bracketed={true} />;\nexport const b = <div data-context-bracketing={true} />;\nexport const c = <div className="data-context-bracket" />;\n',
      },
      why: "THE ATTRIBUTE IDENTITY, pinned: TWO longer attribute names that merely START WITH the probe's are neither of them writers. Two, not one, on purpose — the verdict is `> 1`, so a single loosened match could never report and the cut would come back clean for a reason unrelated to the fence. Relax `=== REGION_ATTR` to `startsWith` and this row is the one that dies. The `className` string beside them is DOCUMENTATION, not a pin: the visitor is keyed on `JsxAttribute`, so a string literal is structurally unreachable and no cut of this fence can make it report",
    },
  ],
});

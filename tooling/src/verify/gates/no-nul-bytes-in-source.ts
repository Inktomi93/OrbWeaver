// Raw NUL source bytes make Git classify a text change as binary and hide its reviewable diff.
// FAMILY: singleton; the subject is raw byte occurrence metadata, not a shared syntax predicate.
// POPULATION PORT: preserve the five legacy roots, text extensions and generated-directory fences.
// ResourceHost owns disk/overlay enumeration and byte decoding; no private walk or Project remains.
// Unlike the legacy catch-and-skip walker, missing, empty or unreadable declared trees refuse.
// Authority is hard because an occurrence can be in comment/prose bytes with no ordinary AST carrier.
// Legacy source: 4522eee58. Differential, marker census and real-corpus controls are owed after conversion
// under the owner's 2026-09-13 conversion-first ordering; this header makes no measured parity claim.
import { defineGate } from "../contract/policy.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

const SKIP_DIRS: ReadonlySet<string> = new Set([".git", "node_modules", "dist", "coverage", ".cache", ".turbo", "generated"]);
const TEXT_EXT_RE = /\.(?:ts|tsx|mts|cts|js|jsx|mjs|cjs|json|jsonc|md|css|scss|sql|html|yml|yaml|txt|sh)$/u;

const MESSAGE = "a raw NUL (0x00) byte in a text source can make Git classify its diff as binary, hiding the change from review.";
const FIX =
  "preserve a meaningful separator by spelling it as the source escape \\u0000; delete only an accidental NUL. Check that Git shows a text diff afterward.";

export const gate = defineGate({
  id: "no-nul-bytes-in-source",
  family: "no-nul-bytes-in-source",
  authority: "hard",
  severity: "error",
  population: { of: "none", why: "raw byte inventories include non-TypeScript text and docs" }, // resource inventories include non-TypeScript source and docs
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [
    { kind: "authored-tree", id: "packages" },
    { kind: "authored-tree", id: "tooling" },
    { kind: "authored-tree", id: "tests" },
    { kind: "authored-tree", id: "scripts" },
    { kind: "authored-tree", id: "docs" },
  ],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    evaluate: () => {
      const trees = [
        readyResourceValue(ctx.resources.authoredTree("packages")),
        readyResourceValue(ctx.resources.authoredTree("tooling")),
        readyResourceValue(ctx.resources.authoredTree("tests")),
        readyResourceValue(ctx.resources.authoredTree("scripts")),
        readyResourceValue(ctx.resources.authoredTree("docs")),
      ];
      for (const entries of trees) {
        for (const entry of entries) {
          if (entry.kind !== "file" || !TEXT_EXT_RE.test(entry.path) || entry.path.split("/").some((segment) => SKIP_DIRS.has(segment))) {
            continue;
          }
          for (const line of entry.nulLines) {
            ctx.report.file(entry.path, { line, column: 1, message: MESSAGE });
          }
        }
      }
      ctx.receipt({ kind: "population", source: "source-byte-trees", members: trees.length });
    },
  }),
  mustRefuse: [
    {
      mode: "resource",
      files: {
        "tooling/.nul-proof-anchor.txt": "clean",
        "tests/.nul-proof-anchor.txt": "clean",
        "scripts/.nul-proof-anchor.txt": "clean",
        "docs/.nul-proof-anchor.txt": "clean",
      },
      expect: { messageIncludes: "authored-tree:packages" },
      why: "an absent declared source tree withholds the owner rather than silently skipping that population",
    },
  ],
  mustFlag: [
    {
      mode: "resource",
      files: {
        "packages/.nul-proof-anchor.txt": "clean",
        "tooling/.nul-proof-anchor.txt": "clean",
        "tests/.nul-proof-anchor.txt": "clean",
        "scripts/.nul-proof-anchor.txt": "clean",
        "docs/.nul-proof-anchor.txt": "clean",
        "scripts/repeated.txt": "a\u0000b\u0000c\n",
      },
      expect: { count: 2, messageIncludes: "raw NUL" },
      why: "two NUL bytes on the same line remain two occurrences rather than collapsing into a line-level finding",
    },
    {
      mode: "resource",
      // The founding shape: a NUL inside a template literal — invisible in every editor and every linter,
      // and the exact byte that made a source file diff as `Bin` for its whole life.
      files: {
        "packages/.nul-proof-anchor.txt": "clean",
        "tooling/.nul-proof-anchor.txt": "clean",
        "tests/.nul-proof-anchor.txt": "clean",
        "scripts/.nul-proof-anchor.txt": "clean",
        "docs/.nul-proof-anchor.txt": "clean",
        "packages/server/src/domain/x/verbs/y.ts": "export const key = `a\u0000b`;\n",
      },
      expect: { count: 1, messageIncludes: "raw NUL" },
      why: "the founding shape — a raw NUL inside a template literal (the separator idiom written as a BYTE); tsc/biome/eslint are all green on it while git prints `Bin` for every diff",
    },
    {
      mode: "resource",
      // Not just template literals: a plain string arg, and a NUL inside a COMMENT (which no escape can
      // rescue — the fix there is rewording). Two occurrences in one file ⇒ two findings.
      files: {
        "packages/.nul-proof-anchor.txt": "clean",
        "tooling/.nul-proof-anchor.txt": "clean",
        "tests/.nul-proof-anchor.txt": "clean",
        "scripts/.nul-proof-anchor.txt": "clean",
        "docs/.nul-proof-anchor.txt": "clean",
        "packages/kit/src/x.ts": '// the separator is \u0000 here\nexport const s = "\u0000";\n',
      },
      expect: { count: 2, messageIncludes: "raw NUL" },
      why: "one NUL in a comment and one in a plain string literal — per-OCCURRENCE reporting, and the comment case proves the gate is not template-literal-shaped",
    },
    {
      mode: "resource",
      files: {
        "packages/.nul-proof-anchor.txt": "clean",
        "tooling/.nul-proof-anchor.txt": "clean",
        "tests/.nul-proof-anchor.txt": "clean",
        "scripts/.nul-proof-anchor.txt": "clean",
        "docs/.nul-proof-anchor.txt": "clean",
        "docs/architecture/core/__probe.md": "---\nkind: law\n---\n\nprose with a \u0000 in it.\n",
      },
      expect: { count: 1, messageIncludes: "raw NUL" },
      why: "a NUL in a doc — markdown is a tracked text source too, and a binary-classified law doc reviews as `Bin` exactly like code",
    },
    {
      mode: "resource",
      files: {
        "packages/.nul-proof-anchor.txt": "clean",
        "tooling/.nul-proof-anchor.txt": "clean",
        "tests/.nul-proof-anchor.txt": "clean",
        "scripts/.nul-proof-anchor.txt": "clean",
        "docs/.nul-proof-anchor.txt": "clean",

        "tooling/src/verify/gates/__probe.ts": 'const GAP = "\u0000";\nexport const gate = { name: "__probe", mustFlag: [1], mustPass: [1], gap: GAP };\n',
      },
      expect: { count: 1, messageIncludes: "raw NUL" },
      why: "the gate corpus scans ITSELF — the live instance of this defect was `dangling-refs.ts`'s own `GAP` const, which made that gate's 26KB rewrite diff as `Bin 13848 -> 40068`",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        "packages/.nul-proof-anchor.txt": "clean",
        "tooling/.nul-proof-anchor.txt": "clean",
        "tests/.nul-proof-anchor.txt": "clean",
        "scripts/.nul-proof-anchor.txt": "clean",
        "docs/.nul-proof-anchor.txt": "clean",
        "packages/ui/src/generated/nul.ts": "// \u0000\n",
        "tests/coverage/nul.txt": "\u0000",
      },
      why: "the legacy generated and coverage directory exclusions survive while all five declared trees remain present",
    },
    {
      mode: "resource",
      files: {
        "packages/.nul-proof-anchor.txt": "clean",
        "tooling/.nul-proof-anchor.txt": "clean",
        "tests/.nul-proof-anchor.txt": "clean",
        "scripts/.nul-proof-anchor.txt": "clean",
        "docs/.nul-proof-anchor.txt": "clean",
        "packages/server/src/domain/x/verbs/y.ts": 'export const key = `a\\u0000b`;\nexport const s = "\\u0000";\n',
      },
      why: "the SANCTIONED spelling: the separator written as the two-character ESCAPE `\\u0000`. Same runtime bytes in the joined value, zero NULs in the source — this is what the fix produces",
    },
    {
      mode: "resource",
      files: {
        "packages/.nul-proof-anchor.txt": "clean",
        "tooling/.nul-proof-anchor.txt": "clean",
        "tests/.nul-proof-anchor.txt": "clean",
        "scripts/.nul-proof-anchor.txt": "clean",
        "docs/.nul-proof-anchor.txt": "clean",
        "packages/ui/src/x.ts": 'export const emoji = "— ✓ … ‘’";\nexport const cr = "a\\r\\nb\\tc";\n',
      },
      why: "multi-byte UTF-8, an em dash, and real control ESCAPES (\\r\\n\\t) are all fine — the gate matches the single byte 0x00 and nothing else, so it never fires on ordinary non-ASCII text",
    },
    {
      mode: "resource",
      // DECLARED LIMIT: the extension fence. A genuinely binary asset under a scanned root is skipped.
      files: {
        "packages/.nul-proof-anchor.txt": "clean",
        "tooling/.nul-proof-anchor.txt": "clean",
        "tests/.nul-proof-anchor.txt": "clean",
        "scripts/.nul-proof-anchor.txt": "clean",
        "docs/.nul-proof-anchor.txt": "clean",
        "tests/support/fixtures/tiny.png": "\u0000PNG\u0000\u0000binary\u0000",
      },
      why: "DECLARED LIMIT — a real binary asset (`.png`) under a scanned root is outside the text-extension fence and must not fire; only text-source extensions are judged",
    },
  ],
});

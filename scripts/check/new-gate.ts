// `pnpm gate:new <kebab-name>` — scaffolds a structural gate with EVERY coupled site stubbed, then prints
// the ones that live outside the gate file (the doc row, the count bump, the anti-drift fixture). The
// template is the law executable: it ships two-sided from birth (an exemption table WITH its stale arm and
// a real-tree anchor guard) so the shape is copied instead of remembered. Law: scripts/check/GATE-AUTHORING.md.
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const KEBAB_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const NAME_TOKEN = "__NAME__";
const GATES_DIR = "scripts/check/gates";
const LAW = "scripts/check/GATE-AUTHORING.md";
const ENFORCEMENT_DOC = "docs/architecture/core/Core-Enforcement-Active-Gates.md";
const FIXTURE_TEST = "tests/tooling/check-gates.int.test.ts";
const EXIT_USAGE = 2;

const TEMPLATE = `// Gate: __NAME__ — <ONE line: what shape is banned and WHY it is a defect, not a preference>.
// <the ARMS, one line each> · DECLARED LIMITS: <what this reader cannot see — each one owes a mustPass row>.
// Header budget is 5 lines (scripts/check/GATE-AUTHORING.md §7); delete this line and the two above once real.
import { SyntaxKind } from "ts-morph";
import type { ExemptionTable, GateDescriptor } from "../contract.ts";
import { fileLoaded } from "../pass.ts";

// TODO(scaffold): the shape this gate bans. Replace the placeholder with the real predicate — and read
// §3 of the law first: a \`scanRoot\` predicate takes a BARE repo-relative path, and the absolute form
// fails SILENTLY GREEN (conformance's virtual paths never catch it).
const BANNED_IDENTIFIER = "__ORB_GATE_PLACEHOLDER__";

// The REAL-TREE ANCHOR the stale arm guards on: a file present on every real run and never needed by an
// example. \`ctx.scope.kind === "project"\` alone is NOT enough — conformance mini-projects report
// "project" too and would red this gate's own self-proof (GATE-AUTHORING.md §4.5).
const REAL_TREE_ANCHOR = "packages/db/src/schema/index.ts";

const GATE_SELF = "scripts/check/gates/__NAME__.ts";

// Sanctioned exceptions. TYPED rows: \`why\` is mandatory and MUST carry the condition that ends the
// exemption. Born EMPTY on purpose — fix violations at landing; an allowlist is for PERMANENT deliberate
// exceptions only (GATE-AUTHORING.md §4.7).
const ALLOWLIST: ExemptionTable = {};

const MESSAGE =
  "TODO(scaffold): the rule this gate enforces — what is wrong, and why. Written ONCE here; a Finding " +
  "never repeats it. End it with a pointer (a <Doc>.md §N, a packages/… home, or a concrete file.ts) or " +
  "diagnostic-legibility reds. See scripts/check/GATE-AUTHORING.md.";

const FIX = "TODO(scaffold): how to correct it — the smallest honest change, named concretely.";

const STALE_ENTRY_PREFIX =
  "ALLOWLIST row matching NO live violation any more (ratchet down) — the exemption is unused; delete the " +
  "stale row in scripts/check/gates/__NAME__.ts: ";

const seenAllowlisted = new Set<string>();

export const gate: GateDescriptor = {
  name: "__NAME__",
  // TODO(scaffold): the enforcement-doc citation. A \`§\` anchor must be DEFINED in the doc it names —
  // gate-modernization arm C reds a phantom section.
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3)",
  status: "active",
  // TODO(scaffold): "whole-project" whenever the verdict needs more than the file it is looking at
  // (registry / parity / uniqueness / coverage). Getting this wrong FALSE-GREENS every scoped run.
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: FIX,
  // Sanctioned homes are SCANNED, not scoped OUT: the only exemption is a cited ALLOWLIST row, so a moved
  // file goes RED at its new path instead of silently carrying its exemption (GATE-AUTHORING.md §3).
  scanRoot: (p) => p.startsWith("packages/"),
  kinds: [SyntaxKind.Identifier],

  begin: () => {
    seenAllowlisted.clear();
  },

  visit: (node, sf, ctx) => {
    if (node.getText() !== BANNED_IDENTIFIER) {
      return;
    }
    const rel = ctx.root.length > 0 && sf.getFilePath().startsWith(ctx.root) ? sf.getFilePath().slice(ctx.root.length + 1) : sf.getFilePath();
    if (rel in ALLOWLIST) {
      seenAllowlisted.add(rel);
      return;
    }
    ctx.report(node);
  },

  finalize: (ctx) => {
    if (!fileLoaded(ctx, REAL_TREE_ANCHOR)) {
      return; // not the real tree — a stale claim here would judge a synthetic fileset
    }
    for (const rel of Object.keys(ALLOWLIST)) {
      if (!seenAllowlisted.has(rel)) {
        ctx.report({ file: GATE_SELF, line: 1, column: 0, message: STALE_ENTRY_PREFIX + rel });
      }
    }
  },

  // TODO(scaffold): replace with the REAL violation shape — the actual defect this gate was minted from.
  // Cover EVERY spelling of it (object vs array; self-closing vs paired JSX; wrapped vs bare literal): a
  // gate that catches one form is a half-gate, and a fixture the reader cannot parse is a LYING PROOF.
  mustFlag: [
    {
      files: "export const x = __ORB_GATE_PLACEHOLDER__;\\n",
      at: "packages/server/src/domain/x/x.ts",
      expect: { count: 1 },
      why: "TODO(scaffold): the founding shape — name the real defect this row reproduces",
    },
  ],
  // TODO(scaffold): one row per NEAR-MISS the gate must not bite, and one per DECLARED LIMIT — a written
  // baseline beats an assumption.
  mustPass: [
    {
      files: "export const x = 1;\\n",
      at: "packages/server/src/domain/x/x.ts",
      why: "TODO(scaffold): the sanctioned shape the rule deliberately allows",
    },
  ],
};
`;

function fail(msg: string): never {
  process.stderr.write(`${msg}\n`);
  process.exit(EXIT_USAGE);
}

const name = process.argv[2];
if (name === undefined || !KEBAB_RE.test(name)) {
  fail("usage: pnpm gate:new <kebab-name>\nthe gate NAME must equal its filename (loader-enforced) and be kebab-case.");
}

const root = process.cwd();
const rel = `${GATES_DIR}/${name}.ts`;
const abs = join(root, rel);
if (existsSync(abs)) {
  fail(`${rel} already exists — pick another name or edit it directly.`);
}

writeFileSync(abs, TEMPLATE.replaceAll(NAME_TOKEN, name));

process.stdout.write(
  [
    "",
    `wrote ${rel}`,
    "",
    `READ ${LAW} IN FULL before filling it in. The gate is ACTIVE from this moment — the loader IS the`,
    "registry — so `pnpm check` will RED until the remaining coupled sites land. That is the ritual:",
    "",
    `  1. ${rel}`,
    "     fill every TODO(scaffold). Prove it BITES the REAL shape on the REAL tree:",
    "       pnpm exec tsx scripts/check/report.ts     # conformance passing proves NOTHING about scanRoot",
    "",
    `  2. ${ENFORCEMENT_DOC}`,
    "     add the Layer-3 ACTIVE table row:",
    "",
    `       | \`${name}\` | <what it enforces, incl. the arms + declared limits> |`,
    "",
    `  3. ${ENFORCEMENT_DOC}`,
    '     bump the "(N registered gates)" count line by one.',
    "",
    `  4. ${FIXTURE_TEST}`,
    "     add the anti-drift fixture inside writeFixtures() — a MINIMAL real-tree violation at the path",
    "     your scanRoot anchors on:",
    "",
    `       // ${name}: <one line — what this fixture violates>`,
    `       fx("packages/server/src/domain/__g_${name.replaceAll("-", "")}/x.ts", "export const x = __ORB_GATE_PLACEHOLDER__;\\n");`,
    "",
    "     ...OR, if no throwaway file can trigger it (a whole-corpus ratchet / real-manifest parity), add",
    `     "${name}" to UNFIXTURABLE_GATES with a comment stating WHY. Never fake a fixture.`,
    "",
    "  5. verify:",
    "       pnpm exec tsx scripts/check/report.ts",
    "       pnpm vitest run tests/tooling/gate-conformance.int.test.ts tests/tooling/check-gates.int.test.ts",
    "",
    "  6. FIX the live violations it finds, in THIS lane. An allowlist row is for a PERMANENT deliberate",
    "     exemption only (reason + stale arm, both scaffolded above) — never debt parking.",
    "",
  ].join("\n"),
);

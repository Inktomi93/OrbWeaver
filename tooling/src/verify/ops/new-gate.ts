// `pnpm gate:new <kebab-name>` — scaffolds a structural gate with EVERY coupled site stubbed, then prints
// the ones that live outside the gate file. The template is the law executable: the shape is COPIED
// instead of remembered, which is exactly why it must emit the CURRENT contract.
//
// #2102: it emitted the LEGACY one. Until 2026-09-12 this scaffold wrote a `GateDescriptor` with an
// `ExemptionTable`, a `scanRoot` predicate, `visit`/`finalize` hooks and a hand-rolled stale arm, and its
// ritual sent the operator to `GATE-AUTHORING.md`, to a `check-gates.repo.int.test.ts` fixture and to the
// legacy proof shape. §5 forbids an `ExemptionTable` in a final policy, so every gate minted from this
// template was born owing an authority migration — a generator that teaches the shape its own program
// bans. The template below is a `defineGate` FINAL policy: it loads, validates, and its `mustFlag` /
// `mustPass` rows pass `pnpm check:policy-conformance` on arrival, so a freshly scaffolded gate is green
// until the author makes it mean something. Law: docs/design/gate-runtime-standardization.md §2.
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { UsageError } from "@orb/tooling/_shared/run-tool";

refuseDirectInvocation(import.meta.url, "pnpm gate:new <kebab-name>");

const KEBAB_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const NAME_TOKEN = "__NAME__";
const GATES_DIR = "tooling/src/verify/gates";
const LAW = "docs/design/gate-runtime-standardization.md";
const ENFORCEMENT_DOC = "docs/architecture/core/Core-Enforcement-Active-Gates.md";
const FAMILY_TESTS = "tests/tooling/verify/gates";

const TEMPLATE = `// Gate: __NAME__ — <ONE line: what shape is banned and WHY it is a defect, not a preference>.
// <the ARMS, one line each> · DECLARED LIMITS: <what this reader cannot see — each one owes a mustPass row>.
// FAMILY: <the shared lib/ computation or canonical subject (module + declaration) this policy consumes, or "singleton" and why>.
// POPULATION: <new policy scope, or legacy-minus-final and final-minus-legacy port/correction>.
// RETIRED MARKERS: <none for a new policy; conversion before/after census and translated final positions>.
// Replace these placeholders with the smallest complete header; preserve each applicable obligation.
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

// TODO(scaffold): the shape this gate bans. Replace the placeholder with the real predicate.
const BANNED_IDENTIFIER = "__ORB_GATE_PLACEHOLDER__";

const MESSAGE =
  "TODO(scaffold): the rule this gate enforces — what is wrong, and why. Written ONCE here; a finding " +
  "never repeats it. End it with a pointer (a <Doc>.md §N, a packages/… home, or a concrete file.ts) or " +
  "diagnostic-legibility reds.";

const FIX = "TODO(scaffold): how to correct it — the smallest honest change, named concretely.";

export const gate = defineGate({
  id: "__NAME__",
  // The FAMILY string. A policy that shares a lib/ reader with siblings shares their family; a split by
  // AUTHORITY (this policy plus a hard \`-health\` sibling) uses the IDENTICAL family on both halves. A
  // singleton's family equals its id — the loader enforces that, so getting it wrong refuses at load.
  family: "__NAME__",
  // "ordinary" is waivable at the reported position with an \`@orb-waive __NAME__(<pos>)\` marker;
  // "hard" is not; "reviewed-grant" means every exception is a row in the central grant table. There is
  // no fourth option and NO private exemption table — §5 bans one in a final policy outright.
  authority: "ordinary",
  // "error" takes no workItem; "warning" REQUIRES one (the debt it is parked against).
  severity: "error",
  // TODO(scaffold): the POPULATION, and the \`why\` is a claim about REACH, not a convenience filter. A
  // \`notUnder\` subtraction owes a mustPass row with a SECOND admitted file beside it — a fixture holding
  // only the subtracted path admits nothing and comes back a [population] TOOL ERROR, not a finding.
  population: { of: "all", why: "TODO(scaffold): why THIS population, in one sentence" },
  // "syntax" must not reach the type checker — not via ctx.checker(), and not via a ts-morph node's
  // getType/getSymbol/getContextualType either (gate-modernization arm E reads the DECLARATION).
  analysis: "syntax",
  execution: "selected-files",
  // Facts and resources are DECLARED, never taken: \`facts: []\` explicit, and every resource read owes a
  // kind from contract/resource-declaration.ts. A private filesystem read, walk or cache is banned here.
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.Identifier],
        visit: (node) => {
          if (node.getText() === BANNED_IDENTIFIER) {
            ctx.report.node(node, { token: BANNED_IDENTIFIER, offset: 0 });
          }
        },
      },
    ],
  }),
  // TODO(scaffold): replace with the REAL violation shape — the actual defect this gate was minted from.
  // Cover EVERY spelling of it (object vs array; self-closing vs paired JSX; wrapped vs bare literal): a
  // gate that catches one form is a half-gate, and a fixture the reader cannot parse is a LYING PROOF.
  mustFlag: [
    {
      mode: "source",
      files: { "packages/server/src/domain/x/x.ts": "export const x = __ORB_GATE_PLACEHOLDER__;\\n" },
      expect: { count: 1, token: "__ORB_GATE_PLACEHOLDER__" },
      why: "TODO(scaffold): the founding shape — name the real defect this row reproduces",
    },
  ],
  // TODO(scaffold): one row per NEAR-MISS the gate must not bite, and one per DECLARED LIMIT — a written
  // baseline beats an assumption. A row whose \`why\` does not name what would RED if the fence were cut is
  // a row nobody can audit.
  mustPass: [
    {
      mode: "source",
      files: { "packages/server/src/domain/x/x.ts": "export const x = 1;\\n" },
      why: "TODO(scaffold): the sanctioned shape the rule deliberately allows",
    },
  ],
});
`;

/** The `gate:new` verb — scaffold the gate file, then print every coupled site that lives outside it. */
export function runNewGate(root: string, argv: readonly string[]): number {
  const name = argv[0];
  // ONE kebab name is the whole tail (#1117) — refused BEFORE the scaffold is written, because this verb's
  // silent-ignore leaves a gate file on disk under a name the operator did not mean to be the only one.
  const stray = argv[1];
  if (stray !== undefined) {
    throw new UsageError(`new-gate scaffolds ONE gate per invocation — got ${JSON.stringify(stray)} as well (usage: pnpm gate:new <kebab-name>)`);
  }
  if (name === undefined || !KEBAB_RE.test(name)) {
    throw new UsageError("usage: pnpm gate:new <kebab-name>\nthe gate NAME must equal its filename (loader-enforced) and be kebab-case.");
  }
  const rel = `${GATES_DIR}/${name}.ts`;
  const abs = join(root, rel);
  if (existsSync(abs)) {
    throw new UsageError(`${rel} already exists — pick another name or edit it directly.`);
  }

  writeFileSync(abs, TEMPLATE.replaceAll(NAME_TOKEN, name));

  process.stdout.write(
    [
      "",
      `wrote ${rel}`,
      "",
      `READ ${LAW} IN FULL before filling it in — it is the \`defineGate\` contract, and`,
      "`tooling/src/verify/gates/GATE-AUTHORING.md` is the final policy guide. Its linked archive",
      "(`docs/history/gate-authoring-legacy-2026-09-13.md`) is only for remaining legacy maintenance and",
      "conversion archaeology. The loader registers this policy immediately; the coupled sites are owed in this lane:",
      "",
      `  1. ${rel}`,
      "     fill every TODO(scaffold). The scaffold is green on arrival; it starts MEANING something when",
      "     its predicate and its proof rows describe the real defect. Prove it bites:",
      "",
      "       pnpm test:scoped <the importing family test>",
      "     Coordinate whole-corpus `pnpm check:policy-conformance` at the integration barrier.",
      "",
      `  2. ${FAMILY_TESTS}/<family>.test.ts`,
      "     the committed receipt — import this module and assert `verifyPolicyProofs([gate])` equals `[]`.",
      "     A family test often lives under the WAVE's name rather than the gate's, so grep the gate ID as a",
      "     STRING across that directory before writing a new file; an existing family file takes the row.",
      "",
      `  3. ${ENFORCEMENT_DOC}`,
      "     add the Layer-3 ACTIVE table row:",
      "",
      `       | \`${name}\` | <what it enforces, incl. the arms + declared limits> |`,
      "",
      "     The loader supplies registration identity; do not add a registration list or hand-maintained count.",
      "",
      "  4. FIX the live violations it finds, in THIS lane. There is no private exemption table in a final",
      "     policy (§5): a permanent, reasoned exception is a row in the central reviewed-grant table with",
      '     its `why` AND its `endsWhen`, and `authority: "reviewed-grant"` on this policy. Never debt parking.',
      "",
    ].join("\n"),
  );

  return EXIT.clean;
}

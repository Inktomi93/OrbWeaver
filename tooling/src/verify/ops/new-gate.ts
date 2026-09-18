// `pnpm gate:new <kebab-name> (--singleton-reason "<reason>" | --family-of <existing-gate-id> --dependency <canonical-lib-path>#<declaration-name>)` — scaffolds a structural gate with EVERY coupled site stubbed, then prints
// the ones that live outside the gate file. The template is the law executable: the shape is COPIED
// instead of remembered, which is exactly why it must emit the CURRENT contract.
//
// #2102: it emitted the LEGACY one. Until 2026-09-12 this scaffold wrote a `GateDescriptor` with an
// `ExemptionTable`, a `scanRoot` predicate, `visit`/`finalize` hooks and a hand-rolled stale arm, and its
// ritual sent the operator to `tooling/src/verify/gates/GATE-AUTHORING.md`, to a `check-gates.repo.int.test.ts` fixture and to the
// legacy proof shape. §5 forbids an `ExemptionTable` in a final policy, so every gate minted from this
// template was born owing an authority migration — a generator that teaches the shape its own program
// bans. The template below is a `defineGate` FINAL policy: it loads, validates, and its `mustFlag` /
// `mustPass` rows pass `pnpm check:policy-conformance` on arrival, so a freshly scaffolded gate is green
// for an explicit singleton. A shared-family draft still owes actual dependency consumption. Law: docs/design/gate-runtime-standardization.md §2.
import { existsSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import process from "node:process";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { UsageError } from "@orb/tooling/_shared/run-tool";
import { getWorkspace } from "@orb/tooling/_shared/ts-workspace";
import { Node } from "ts-morph";
import { descriptorValue, finalDescriptorOf, policyProductionDependencies, staticText } from "../lib/policy-descriptor-read.ts";

export const NEW_GATE_USAGE =
  'usage: pnpm gate:new <kebab-name> (--singleton-reason "<reason>" | --family-of <existing-gate-id> --dependency <canonical-lib-path>#<declaration-name>)\n' +
  "The verify new-gate verb scaffolds a final defineGate policy; shared-family drafts require actual dependency consumption. Follow tooling/src/verify/gates/GATE-AUTHORING.md.";

refuseDirectInvocation(import.meta.url, NEW_GATE_USAGE);

const KEBAB_RE = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u;
const NAME_TOKEN = "__NAME__";
const GATES_DIR = "tooling/src/verify/gates";
const LAW = "docs/design/gate-runtime-standardization.md";
const ENFORCEMENT_DOC = "docs/architecture/core/Core-Enforcement-Active-Gates.md";
const FAMILY_TESTS = "tests/tooling/verify/gates";

const TEMPLATE = `// Gate: __NAME__ — <ONE line: what shape is banned and WHY it is a defect, not a preference>.
// <the ARMS, one line each> · DECLARED LIMITS: <what this reader cannot see — each one owes a mustPass row>.
// FAMILY: __FAMILY_REASON__.
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
  family: "__FAMILY__",
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

type FamilyChoice = { readonly kind: "singleton"; readonly reason: string } | { readonly kind: "shared"; readonly peer: string; readonly dependency: string };

function familyChoice(argv: readonly string[]): FamilyChoice {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const option = argv[index];
    if (option === undefined || !option.startsWith("--")) {
      throw new UsageError(`new-gate scaffolds ONE gate per invocation. ${NEW_GATE_USAGE}`);
    }
    if (option !== "--singleton-reason" && option !== "--family-of" && option !== "--dependency") {
      throw new UsageError(`unknown new-gate option ${option}. ${NEW_GATE_USAGE}`);
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--") || value.trim() === "" || /[\p{Cc}\p{Zl}\p{Zp}]/u.test(value) || values.has(option)) {
      throw new UsageError(`new-gate requires one nonempty, single-line value for ${option}. ${NEW_GATE_USAGE}`);
    }
    values.set(option, value.trim());
  }
  const reason = values.get("--singleton-reason");
  const peer = values.get("--family-of");
  const dependency = values.get("--dependency");
  if (reason !== undefined && values.size === 1) {
    return { kind: "singleton", reason };
  }
  if (reason === undefined && peer !== undefined && KEBAB_RE.test(peer) && dependency !== undefined) {
    return { kind: "shared", peer, dependency };
  }
  throw new UsageError(`choose an explicit singleton reason or an existing family and production dependency. ${NEW_GATE_USAGE}`);
}

/** Selection is by a canonical declaration reached from the peer's production roots, never by a theme
 *  or common module filename. This records intended sharing; it cannot author the new predicate's use. */
function sharedFamily(root: string, choice: Extract<FamilyChoice, { kind: "shared" }>): string {
  const [modulePath, declarationName, extra] = choice.dependency.split("#");
  if (
    modulePath === undefined ||
    declarationName === undefined ||
    declarationName === "" ||
    extra !== undefined ||
    !modulePath.startsWith("tooling/src/verify/lib/") ||
    !modulePath.endsWith(".ts") ||
    modulePath.includes("\\") ||
    relative(resolve(root), resolve(root, modulePath)).replaceAll("\\", "/") !== modulePath
  ) {
    throw new UsageError("production dependency must name a canonical tooling/src/verify/lib/*.ts#declaration");
  }
  const peerPath = join(root, GATES_DIR, `${choice.peer}.ts`);
  if (!existsSync(peerPath)) {
    throw new UsageError(`no existing final gate ${choice.peer} for this production dependency`);
  }
  const project = getWorkspace({ root, types: true, globs: [peerPath] });
  const source = project.getSourceFileOrThrow(peerPath);
  const descriptor = finalDescriptorOf(source);
  if (descriptor === undefined || staticText(descriptorValue(descriptor, "id")) !== choice.peer) {
    throw new UsageError(`${choice.peer} is not a canonical final gate for this production dependency`);
  }
  const family = staticText(descriptorValue(descriptor, "family"));
  if (family === undefined || !KEBAB_RE.test(family)) {
    throw new UsageError(`cannot resolve family for ${choice.peer}`);
  }
  const dependencies = policyProductionDependencies([descriptor]).get(descriptor) ?? new Set();
  const matches = [...dependencies].filter(
    (declaration) =>
      declaration.getSourceFile().getFilePath() === resolve(root, modulePath) && Node.hasName(declaration) && declaration.getName() === declarationName,
  );
  if (matches.length !== 1) {
    throw new UsageError(`${choice.dependency} is not one canonical production dependency of ${choice.peer}`);
  }
  return family;
}

/** The `gate:new` verb — require an evidence-backed family choice before creating the draft. */
export function runNewGate(root: string, argv: readonly string[]): number {
  const name = argv[0];
  if (name === undefined || !KEBAB_RE.test(name)) {
    throw new UsageError(NEW_GATE_USAGE);
  }
  const choice = familyChoice(argv.slice(1));
  const rel = `${GATES_DIR}/${name}.ts`;
  const abs = join(root, rel);
  if (existsSync(abs)) {
    throw new UsageError(`${rel} already exists — pick another name or edit it directly.`);
  }

  const family = choice.kind === "singleton" ? name : sharedFamily(root, choice);
  const reason =
    choice.kind === "singleton"
      ? `singleton — ${choice.reason}`
      : `${family}, ${choice.dependency}; TODO(scaffold): consume this dependency meaningfully from production hooks`;
  const emitted = TEMPLATE.replaceAll(NAME_TOKEN, name)
    .replace('"__FAMILY__"', JSON.stringify(family))
    .replace("__FAMILY_REASON__", () => reason);
  writeFileSync(abs, emitted);
  const readiness =
    choice.kind === "singleton"
      ? "     The singleton placeholder is green on arrival; replace its predicate and proofs with the real defect."
      : "     SHARED DRAFT: Q08 must report missing production sharing until the chosen dependency drives the real predicate.";

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
      "     Fill every TODO(scaffold).",
      readiness,
      "     Prove actual behavior and family sharing:",
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

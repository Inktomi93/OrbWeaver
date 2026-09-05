// THE AUTHORING CONTROL for #1506 — the 22nd gate cannot ship the spelling hole.
//
// A gate's own conformance rows prove it bites THE SHAPE ITS AUTHOR WROTE. Nothing proved it bites the
// same semantics written another way, and 21 live gates were shown blind at once: `db["insert"]` walked
// past a `PropertyAccessExpression`-keyed detector, `import * as events; events.subscribeAllChatEvents`
// past an `ImportSpecifier`-keyed one. This suite RESPELLS every gate's own `mustFlag` fixture — focused
// on the lines that gate actually reported (`lib/spelling-twins.ts` explains why the focus is the whole
// design) — feeds it back through the SAME `verifyGateProofs` door, and compares the resulting blind set
// against a committed ledger.
//
// THE LEDGER IS TWO-SIDED AND SHRINK-ONLY (GATE-AUTHORING.md §4.8). A gate that becomes blind is RED even
// if it is new; a ledger row whose gate is no longer blind is RED ("delete the row"). The population at
// mint is another lane's named burn-down (#1506 follow-up) — what this control buys today is that it
// cannot GROW, which is exactly the "correct by construction" property the fix-all was asked for.
//
// The remedy for a red is never a ledger row: it is `tooling/src/verify/lib/symbol-reference.ts`
// (`readMemberAccess` / `moduleMemberReference` / `readStringConstant`), which resolves a reference
// however it is spelled.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Project, SyntaxKind } from "ts-morph";
import type { GateDescriptor, GateExample } from "../../tooling/src/verify/contract/gate.ts";
import { loadGates, verifyGateProofs } from "../../tooling/src/verify/index.ts";
import { runPass } from "../../tooling/src/verify/lib/pass.ts";
import { spellingTwinsOf } from "../../tooling/src/verify/lib/spelling-twins.ts";
import { expect, test } from "../support/tool-fixtures.ts";
import { scaledBudget } from "./_load-budget.ts";

const ROOT = join(import.meta.dirname, "..", "..");
const LEDGER_REL = "tests/tooling/gate-spelling-twins.baseline.json";
const REGEN = `the ledger is hand-maintained: paste the JSON printed below into ${LEDGER_REL} and run pnpm exec biome format --write on it (biome collapses the short arrays; this test parses the file, so the format is free). Do that ONLY to record a SHRINK — a gate that became blind is a defect to fix in tooling/src/verify/lib/symbol-reference.ts, never a new row.`;

/** LOAD-HONEST BUDGET, same reasoning as gate-conformance.int: this drives ~470 standalone gate passes
 *  in-process — pure CPU with no child process to hang a legible timeout on. */
const TWIN_BUDGET = scaledBudget(120_000, 4);

type BlindSet = Record<string, readonly string[]>;

function filesOf(example: GateExample): Record<string, string> {
  return typeof example.files === "string" ? { [example.at ?? "packages/ui/src/x/x.tsx"]: example.files } : { ...example.files };
}

/** One reused in-memory Project for the "what did this gate report" pre-pass — each example lands under
 *  its OWN virtual root, never a re-created path (GATE-AUTHORING.md §12). */
const shared = new Project({ useInMemoryFileSystem: true });
let exampleSeq = 0;

/** `repo-relative file -> the lines this gate reported on`, from a real standalone pass over the fixture. */
function reportedLines(gate: GateDescriptor, files: Readonly<Record<string, string>>): ReadonlyMap<string, ReadonlySet<number>> {
  for (const previous of shared.getSourceFiles()) {
    shared.removeSourceFile(previous);
  }
  exampleSeq += 1;
  const root = `/repo-twin-${exampleSeq}`;
  for (const [rel, text] of Object.entries(files)) {
    shared.createSourceFile(`${root}/${rel}`, text);
  }
  const asActive: GateDescriptor = gate.status === "active" ? gate : { ...gate, status: "active" };
  const result = runPass([asActive], {
    root,
    project: shared,
    scope: { kind: "project" },
    files: shared.getSourceFiles(),
    checker: () => shared.getTypeChecker(),
  });
  const out = new Map<string, Set<number>>();
  for (const finding of result.gates.find((g) => g.name === gate.name)?.findings ?? []) {
    const rel = finding.file.replace(`${root}/`, "");
    const lines = out.get(rel) ?? new Set<number>();
    lines.add(finding.line);
    out.set(rel, lines);
  }
  return out;
}

/** The arms this gate stops biting under, across all of its mustFlag fixtures. */
function blindArmsOf(gate: GateDescriptor): readonly string[] {
  const arms = new Set<string>();
  for (const example of gate.mustFlag) {
    const files = filesOf(example);
    const twins = spellingTwinsOf(files, reportedLines(gate, files));
    for (const [arm, twin] of [
      ["bracket", twins.bracket],
      ["namespace", twins.namespace],
    ] as const) {
      if (twin === undefined) {
        continue;
      }
      const respelled: GateDescriptor = { ...gate, mustFlag: [{ files: twin, why: `${arm} twin of: ${example.why ?? "(no rationale given)"}` }], mustPass: [] };
      if (verifyGateProofs([respelled]).length > 0) {
        arms.add(arm);
      }
    }
  }
  return [...arms].sort();
}

function blindSetOf(gates: readonly GateDescriptor[]): BlindSet {
  const out: BlindSet = {};
  for (const gate of gates) {
    // An fsBacked gate's fixtures are materialized on real disk by a different substrate; the pre-pass
    // above is in-memory, so its reported lines would be a guess. DECLARED LIMIT, stated as a skip.
    if (gate.fsBacked === true) {
      continue;
    }
    const arms = blindArmsOf(gate);
    if (arms.length > 0) {
      Object.assign(out, { [gate.name]: arms });
    }
  }
  return out;
}

test(
  "no gate is blind to a respelling of its own mustFlag fixture beyond the committed, shrink-only ledger",
  async () => {
    const gates = await loadGates(ROOT);
    const ledger = JSON.parse(readFileSync(join(ROOT, LEDGER_REL), "utf8")) as { readonly blind: BlindSet };
    const actual = blindSetOf(gates);

    // A blind gate absent from the ledger = a NEW hole (fix it with lib/symbol-reference.ts, never a row).
    // A ledger row whose gate is no longer blind = a stale promise (delete it). `toEqual` reds on both.
    expect(actual, `${REGEN}\n${JSON.stringify({ blind: actual }, null, 2)}`).toEqual(ledger.blind);
  },
  TWIN_BUDGET,
);

test("THE PLANTED CONTROL: an un-migrated gate is detected blind, and the migrated spelling is not", () => {
  const base = {
    docRow: "test fixture",
    status: "active",
    scopeSafety: "incremental-safe",
    message: "test fixture: a `.forbidden` member read",
    mustFlag: [{ files: "export const a = (db: Record<string, unknown>) => db.forbidden;\n", why: "the dotted spelling" }],
    mustPass: [],
  } as const;

  // (1) The naive detector — `PropertyAccessExpression.getName()`, the exact shape #1506 found in 21 gates.
  const naive: GateDescriptor = {
    ...base,
    name: "twin-control-naive",
    kinds: [SyntaxKind.PropertyAccessExpression],
    visit: (node, _sf, ctx) => {
      if (node.isKind(SyntaxKind.PropertyAccessExpression) && node.getName() === "forbidden") {
        ctx.report(node);
      }
    },
  };
  // (2) The same law read through the shared resolver — both member kinds subscribed.
  const migrated: GateDescriptor = {
    ...base,
    name: "twin-control-migrated",
    kinds: [SyntaxKind.PropertyAccessExpression, SyntaxKind.ElementAccessExpression],
    visit: (node, _sf, ctx) => {
      if (node.isKind(SyntaxKind.PropertyAccessExpression) && node.getName() === "forbidden") {
        ctx.report(node);
        return;
      }
      if (node.isKind(SyntaxKind.ElementAccessExpression) && node.getArgumentExpression()?.getText() === '"forbidden"') {
        ctx.report(node);
      }
    },
  };

  // Both gates prove themselves on the DOTTED fixture — the control is honest only if they start equal.
  expect(verifyGateProofs([naive])).toEqual([]);
  expect(verifyGateProofs([migrated])).toEqual([]);

  expect(blindSetOf([naive, migrated])).toEqual({ "twin-control-naive": ["bracket"] });
});

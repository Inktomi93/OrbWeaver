// Gate: stale-draft-commit — a once-seeded draft whose commit is guarded by `draft !== <the LIVE value>`
// writes the stale draft back over whatever a second writer just landed (#1485/#1502/#1561). ARM: a
// `useState(<live>)` draft compared against that SAME expression, where the guarded branch hands the draft
// to a non-setter call. DECLARED LIMITS: comparisons outside an `if` (a `dirty` flag), non-client packages,
// and a live value reached through a differently-spelled expression — each owes a mustPass row. Comment-SAFE.
//
// NO EXEMPTION ARTIFACT (authority census C1, #1922; deleted 2026-09-12). This gate carried an `ALLOWLIST`
// `ExemptionTable` plus a ratchet-down arm inside `finalize`. It was born EMPTY and stayed empty — the
// founding sites were fixed in `8e9158e14` and the mint census over 675 client `.tsx` files produced ZERO
// live violations — so the ratchet loop iterated nothing and the `rel in ALLOWLIST` skip could never fire.
// The table, its stale-entry message, the `seenAllowlisted` accumulator and the `begin` hook are gone.
// **`finalize` SURVIVES, and deliberately:** it also carries the DECISION_HOME blindness tripwire, which is
// a different arm over a different subject — a gate whose law has no home is a gate nobody can obey, and
// deleting that with the allowlist would have blinded a live tripwire to buy a tidier diff. A genuine
// future exemption is a central reviewed grant, never a resurrected gate-local table.
import type { Node, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract/gate.ts";
import { unwrapExpression } from "../lib/ast-read.ts";
import { fileLoaded } from "../lib/pass.ts";

// THE DECISION HAS ONE HOME — `packages/client/src/lib/edit-session.ts` (`EditSession` + `resolveCommit`),
// which judges the draft against WHAT IT OPENED WITH instead of against the live value. A component that
// keeps its own `openedFrom` snapshot satisfies this gate for the same reason: the comparison is no longer
// against the moving value. The tripwire below REDs if that home stops resolving, because a gate whose law
// has no home is a gate nobody can obey.
const DECISION_HOME = "packages/client/src/lib/edit-session.ts";

// The real-tree anchor for the stale + blindness arms. NOT any allowlist row's own path, and never needed
// by a conformance example (GATE-AUTHORING.md §4.5).
const REAL_TREE_ANCHOR = "packages/db/src/schema/index.ts";

const GATE_SELF = "tooling/src/verify/gates/stale-draft-commit.ts";

const MESSAGE =
  "a once-seeded draft is being committed under `draft !== <the live value>`. That guard exists to suppress " +
  "a pointless write, but the live value MOVES: when a second writer lands one while the editor is open, the " +
  "comparison passes for a reason that has nothing to do with the user and the branch writes the opened-with " +
  "text back over what arrived. Judge the draft against WHAT IT OPENED WITH, via `resolveCommit` in " +
  "packages/client/src/lib/edit-session.ts.";

const FIX =
  "seed an `openedFrom` snapshot beside the draft and commit through `resolveCommit(session, live)` " +
  "(packages/client/src/lib/edit-session.ts) — it separates 'nothing typed', 'an ordinary commit', and 'two " +
  "writers, surfaced' instead of collapsing them into one comparison.";

const HOME_GONE =
  `the decision home \`${DECISION_HOME}\` no longer resolves — this gate's message and fix both name it, and a ` +
  "rule whose one home moved is unobeyable. Re-point DECISION_HOME (GATE-AUTHORING.md §4.6).";

/** A `useState` seed that can go STALE: an identifier or property access (the live value), never a literal
 *  or an ALL_CAPS module constant (those cannot move underneath an open editor). */
function stalableSeedText(seed: Node): string | undefined {
  const inner = unwrapExpression(seed);
  const kind = inner.getKind();
  const body = kind === SyntaxKind.ArrowFunction ? unwrapExpression(inner.asKindOrThrow(SyntaxKind.ArrowFunction).getBody()) : inner;
  if (body.getKind() !== SyntaxKind.Identifier && body.getKind() !== SyntaxKind.PropertyAccessExpression) {
    return;
  }
  const text = body.getText();
  const root = text.split(".")[0] ?? text;
  // A module constant (`AUTO`, `NO_KEYWORD`, `DEFAULT`) is not a second writer's value — measured at mint:
  // 8 of the 14 raw shape matches on the client corpus were exactly this, and none is the defect class.
  return /^[A-Z0-9_]+$/u.test(root) ? undefined : text;
}

/** `const [draft, setDraft] = useState(<live>)` → `draft` ⇒ the live expression's text. */
function draftSeeds(sf: SourceFile): ReadonlyMap<string, string> {
  const seeds = new Map<string, string>();
  for (const decl of sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const init = decl.getInitializer();
    if (init === undefined || init.getKind() !== SyntaxKind.CallExpression) {
      continue;
    }
    const call = init.asKindOrThrow(SyntaxKind.CallExpression);
    if (!/(^|\.)useState$/u.test(call.getExpression().getText())) {
      continue;
    }
    const name = decl.getNameNode();
    if (name.getKind() !== SyntaxKind.ArrayBindingPattern) {
      continue;
    }
    const draft = name.asKindOrThrow(SyntaxKind.ArrayBindingPattern).getElements()[0]?.getText();
    const arg = call.getArguments()[0];
    if (draft === undefined || arg === undefined) {
      continue;
    }
    const seed = stalableSeedText(arg);
    if (seed !== undefined) {
      seeds.set(draft, seed);
    }
  }
  return seeds;
}

/** `draft` and `draft.trim()` are the same subject for this comparison. */
function comparedText(node: Node): string {
  const text = node.getText().trim();
  return text.endsWith(".trim()") ? text.slice(0, -".trim()".length) : text;
}

/** THE SECOND HALF, and the one that makes the gate honest: does the guarded branch hand the DRAFT to a
 *  call that is not a state setter? `if (live !== seen) setSeen(live)` is the "changed since I last looked"
 *  idiom — same syntax, no write, and 6 of the 14 raw matches at mint were exactly that. A comparison with
 *  no `if` at all (a `dirty` flag feeding a disabled prop) is a DECLARED LIMIT, not a silent pass: it has
 *  no branch to read, and the mustPass row says so. */
function guardWritesOut(comparison: Node, draft: string): boolean {
  const branch = comparison.getFirstAncestorByKind(SyntaxKind.IfStatement)?.getThenStatement();
  if (branch === undefined) {
    return false;
  }
  const mentionsDraft = branch.getDescendantsOfKind(SyntaxKind.Identifier).some((id) => id.getText() === draft);
  if (!mentionsDraft) {
    return false;
  }
  return branch.getDescendantsOfKind(SyntaxKind.CallExpression).some((call) => {
    const callee = call.getExpression().getText();
    const last = callee.split(".").at(-1) ?? callee;
    return !/^set[A-Z]/u.test(last);
  });
}

/** The whole verdict for ONE comparison: is this a once-seeded draft measured against its own live value,
 *  in a branch that writes the draft out? Returns the draft's name (the reported token) or undefined. */
function staleCommitDraft(comparison: Node, seeds: ReadonlyMap<string, string>): string | undefined {
  const binary = comparison.asKindOrThrow(SyntaxKind.BinaryExpression);
  const op = binary.getOperatorToken().getText();
  if (op !== "!==" && op !== "===") {
    return;
  }
  const left = comparedText(binary.getLeft());
  const right = comparedText(binary.getRight());
  const match = [...seeds].find(([name, live]) => (left === name && right === live) || (right === name && left === live));
  const draft = match?.[0];
  return draft !== undefined && guardWritesOut(comparison, draft) ? draft : undefined;
}

export const gate: GateDescriptor = {
  name: "stale-draft-commit",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3)",
  status: "active",
  // Per-FILE verdict: every fact (the seed, the comparison, the guarded branch) lives in one component file.
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: FIX,
  // The client only. `@orb/ui` is BELOW the client in the cake and structurally cannot import the decision
  // home, so the rule as written cannot govern it (a mustPass row states this limit).
  scanRoot: (p) => p.startsWith("packages/client/src/"),
  visitFile: (sf, ctx) => {
    const seeds = draftSeeds(sf);
    if (seeds.size === 0) {
      return;
    }
    for (const comparison of sf.getDescendantsOfKind(SyntaxKind.BinaryExpression)) {
      const draft = staleCommitDraft(comparison, seeds);
      if (draft !== undefined) {
        ctx.report(comparison, { token: draft, offset: Math.max(comparison.getText().indexOf(draft), 0) });
      }
    }
  },

  finalize: (ctx) => {
    if (!fileLoaded(ctx, REAL_TREE_ANCHOR)) {
      return; // not the real tree — a stale/blindness claim here would judge a synthetic fileset
    }
    if (!fileLoaded(ctx, DECISION_HOME)) {
      ctx.report({ file: GATE_SELF, line: 1, column: 0, message: HOME_GONE });
    }
  },

  mustFlag: [
    {
      files:
        "import { useState } from 'react';\n" +
        "export function Cell({ source, onEdit }: { source: string; onEdit: (v: string) => void }) {\n" +
        "  const [draft, setDraft] = useState(source);\n" +
        "  const commit = () => {\n" +
        "    if (draft !== source) {\n" +
        "      onEdit(draft);\n" +
        "    }\n" +
        "  };\n" +
        "  return draft.length + (setDraft ? 0 : 1) + (commit ? 0 : 1);\n" +
        "}\n",
      at: "packages/client/src/features/x/components/cell.tsx",
      expect: { count: 1 },
      why: "THE FOUNDING SHAPE, verbatim from the pre-8e9158e14 tracker-value.tsx: a draft seeded from the live prop and committed under `draft !== source`",
    },
    {
      files:
        "import { useState } from 'react';\n" +
        "export function Row({ row, save }: { row: { text: string }; save: (v: string) => void }) {\n" +
        "  const [draft, setDraft] = useState(() => row.text);\n" +
        "  const onBlur = () => {\n" +
        "    if (row.text !== draft) {\n" +
        "      save(draft);\n" +
        "    }\n" +
        "  };\n" +
        "  return draft.length + (setDraft ? 0 : 1) + (onBlur ? 0 : 1);\n" +
        "}\n",
      at: "packages/client/src/features/x/components/row.tsx",
      expect: { count: 1 },
      why: "the same defect in its other two spellings — a LAZY `useState(() => …)` seed, a PROPERTY-ACCESS live value, and the comparison written live-first",
    },
  ],
  mustPass: [
    {
      files:
        "import { useState } from 'react';\n" +
        "export function Cell({ source, onEdit }: { source: string; onEdit: (v: string) => void }) {\n" +
        "  const [draft, setDraft] = useState(source);\n" +
        "  const [openedFrom] = useState(source);\n" +
        "  const commit = () => {\n" +
        "    if (draft !== openedFrom) {\n" +
        "      onEdit(draft);\n" +
        "    }\n" +
        "  };\n" +
        "  return draft.length + (setDraft ? 0 : 1) + (commit ? 0 : 1) + openedFrom.length;\n" +
        "}\n",
      at: "packages/client/src/features/x/components/fixed.tsx",
      why: "THE FIX: the same editor judged against WHAT IT OPENED WITH — the shape `resolveCommit` implements, and the shape roster-member-surface.tsx hand-rolls",
    },
    {
      files:
        "import { useState } from 'react';\n" +
        "export function Watcher({ hash }: { hash: string }) {\n" +
        "  const [seen, setSeen] = useState(hash);\n" +
        "  if (hash !== seen) {\n" +
        "    setSeen(hash);\n" +
        "  }\n" +
        "  return seen.length;\n" +
        "}\n",
      at: "packages/client/src/features/x/components/watcher.tsx",
      why: "THE NEAR-MISS the second half exists for: identical syntax, but the branch only RESEEDS local state — 6 of the 14 raw shape matches on the corpus at mint were this idiom",
    },
    {
      files:
        "import { useState } from 'react';\n" +
        "export function Save({ name, onSave }: { name: string; onSave: () => void }) {\n" +
        "  const [draft, setDraft] = useState(name);\n" +
        "  const dirty = draft !== name;\n" +
        "  return dirty ? draft.length + (setDraft ? 0 : 1) + (onSave ? 0 : 1) : 0;\n" +
        "}\n",
      at: "packages/client/src/features/x/components/save.tsx",
      why: "DECLARED LIMIT: a comparison with no guarded branch (a `dirty` flag feeding a disabled prop) has no write for this reader to see — the roster-member-surface class, caught by review rather than here",
    },
    {
      files:
        "import { useState } from 'react';\n" +
        "const AUTO = 'auto';\n" +
        "export function Picker() {\n" +
        "  const [mode, setMode] = useState(AUTO);\n" +
        "  const apply = () => {\n" +
        "    if (mode === AUTO) {\n" +
        "      setMode(AUTO);\n" +
        "    }\n" +
        "  };\n" +
        "  return mode.length + (setMode ? 0 : 1) + (apply ? 0 : 1);\n" +
        "}\n",
      at: "packages/client/src/features/x/components/picker.tsx",
      why: "DECLARED LIMIT: an ALL_CAPS module constant cannot be moved by a second writer, so a draft seeded from one can never go stale against it",
    },
    {
      files:
        "import { useState } from 'react';\n" +
        "export function Prim({ label }: { label: string }) {\n" +
        "  const [draft, setDraft] = useState(label);\n" +
        "  const commit = () => {\n" +
        "    if (draft !== label) {\n" +
        "      console.log(draft);\n" +
        "    }\n" +
        "  };\n" +
        "  return draft.length + (setDraft ? 0 : 1) + (commit ? 0 : 1);\n" +
        "}\n",
      at: "packages/ui/src/primitives/prim/prim.tsx",
      why: "DECLARED LIMIT: `@orb/ui` is out of scanRoot — it sits BELOW the client in the cake and structurally cannot import the decision home this gate's fix names",
    },
  ],
};

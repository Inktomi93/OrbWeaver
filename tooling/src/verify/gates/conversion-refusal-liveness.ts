// Gate: conversion-refusal-liveness (#2017) — a #1584 conversion refusal must be DATA, and its blocker must
// still be true. The class this closes is *"a list written against a tree, with nothing two-sided holding
// it, and then the tree moves"*; the instance is the one the program already paid for twice.
//
// THE DEFECT, LITERALLY. `docs/design/gate-runtime-standardization.md`: ***"A REFUSAL IS A SNAPSHOT, NOT A
// STANDING VERDICT, and nothing re-opens one when its blocker lands"*** (#2013). `runner-config-path-liveness`
// refused conversion citing a missing `authored-path` identity door; §12.4 records that the kind was
// SPECIFIED BY that refusal — it shipped, and the module sat legacy and refusing afterwards, because a
// refusal written in a header comment has no reader. The 2026-09-12 repair was a HUMAN re-derivation of the
// surviving refusals typed back into the same comments, which buys one day and no more. This policy is the
// reader those comments never had.
//
// FAMILY: a declared SINGLETON. The shared reader is `lib/conversion-refusal.ts`
// (`refusalOpenerLine` / `readAuthoredRefusal` / `stringPositionText`); no sibling policy asks about
// conversion refusals, and the authored-shape half goes through the corpus-wide `readStaticAuthoredValue`
// rather than a private parser.
//
// POPULATION: `tooling/src/verify/**`, the whole verify tree rather than `gates/` alone, because ARM B is a
// CENSUS and a census scoped to the accused module could only ever confirm it. The declared blocker names
// its own `under`, and ARM E refuses a `under` the population does not admit — a census that silently
// measured less than it claimed would be the same defect one layer down.
//
// POPULATION IS EXACTLY ONE, RE-DERIVED 2026-09-12 AFTER THE SECOND MEMBER CONVERTED — and that is the row
// working, not eroding. The census (the opener predicate, over all 300 `tooling/src/verify/gates/*.ts`)
// returns `no-blanket-suppression` alone: arm C reads the git INDEX and no shipped kind serves a staged
// blob. `tsconfig-entry-liveness` was the other member and has since CONVERTED (#2021), taking its refusal
// opener with it — which is the outcome the program wants, and ARM C is precisely what would have caught
// the alternative, a declaration outliving its module's conversion. The positive control still
// discriminates: the LOOSER `^// CONVERSION` opener matches THREE modules and the verdict-word predicate
// matches one, so the number is a measurement rather than a grep.
//
// WHAT A POPULATION OF ONE MEANS FOR THIS POLICY'S FUTURE, stated rather than left for a reader to guess.
// It does NOT mean retire it: this policy's whole subject is a refusal that OUTLIVES its blocker, and the
// population is one only because the other member converted — the exact transition it exists to make safe.
// The honest end condition is the one the program already names: when `no-blanket-suppression` converts or
// is deleted, the population goes to ZERO, and a zero population is a REFUSAL here (the `population`
// receipt's `members: 0` turns the run into a policy refusal, never a clean pass), which is the loud signal
// to delete this module rather than leave it reporting serenely on nothing. Until then it is armed over the
// one declaration that exists and over every future one.
//
// FIVE ARMS, each a different way a refusal stops being true:
//   A UNDECLARED — a module whose header OPENS a refusal and which exports no `CONVERSION_REFUSAL`. Prose
//     is what failed; a refusal that is only prose is the defect, not the record of one.
//   B CONSUMER-SET DRIFT — a `sole-consumer` blocker whose census no longer matches, in BOTH directions. A
//     NEW consumer means §12.4's reopen bar (two or more independent consumers) may now be met; a recorded
//     consumer that no longer carries the read means the refusal's own evidence is gone.
//   C ON A CONVERTED MODULE — a declaration in a module that also calls `defineGate`. The #2013 failure
//     inverted: a refusal outliving the conversion it described.
//   D WRONG SELF — `gate` READ and not equal to the module basename (the loader's own id law), which is how
//     a copy-pasted refusal accuses the module it was copied from. It FAILS OPEN on an unreadable `gate`
//     (#2106): an accusation needs the field to have been read, not merely to differ from `undefined`.
//   F CAPABILITY LANDED — a `missing-kind` blocker whose `wouldBeKind` is now a shipped
//     `GateResourceRequest` kind. This is the #2013 failure ITSELF rather than a relative of it: the
//     capability a refusal cited got built, and nothing re-opened the refusal. Added #2116, because the
//     property this header opens with was neither held nor named unheld — only §12.4's SECOND conjunct
//     (the reopen bar) was.
//   E UNREADABLE OR UNSCOPED — a MACHINE field the shared reader cannot read, or a blocker whose `under`
//     admits nothing in this policy's population. Both are the shape that reads as a clean pass while
//     measuring nothing, and E is the arm that keeps D's fail-open from becoming a silent skip: an
//     unreadable declaration is reported exactly once, as a read failure rather than as an accusation.
//
// AND THE ARM QUESTION IS ASKED PER ARM, WHICH IS THE RULE THIS MODULE PAID FOR (#2106). For every branch:
// would it REPORT or PASS on an input the reader could not read? An arm that ACCUSES must pass; an arm
// whose whole claim is "I could not measure this" must report. Getting that backwards on a HARD policy is
// worse than failing open, because the author's only remaining move is a waiver and a waived gate is dead.
//
// AUTHORITY IS `hard`, DELIBERATELY. The two sanctioned answers to a live refusal are convert it or delete
// the gate (owner, 2026-09-12: *"legacy shit doesn't get to stay alive"*); a suppressible refusal-liveness
// check would be a third door — park the module AND silence the thing that re-opens it — which is exactly
// the posture the program exists to end. There is no allowlist and no baseline for the same reason.
//
// COMMENT POSTURE: comments-INTENDED for ARM A only (the refusal opener IS a comment, fenced to the header
// span and to a comment-OPENER match). Every other arm reads AST nodes, and ARM B's census reads STRING
// POSITIONS ONLY — a raw-text census would score each declaring module's own header narration as a
// consumer, which is the #2047 header-span lesson run in the other direction.
//
// DECLARED LIMITS, each with its row: the blob READ itself (`git show :<path>`) has no distinctive string
// spelling and is NOT censused — `--cached` is the discriminator for "this module talks to the git index",
// which is the capability the refusal turns on (`mustPass[1]` pins that a comment mention is not a
// consumer); a census spelling used for an unrelated purpose inside `under` reports as a NEW consumer, and
// that polarity is correct for a snapshot tripwire — the finding says re-derive, not convert.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). NONE:
// this module was BORN FINAL at `03dd7329e` —
// `git cat-file -e 03dd7329e^:tooling/src/verify/gates/conversion-refusal-liveness.ts` fails at its parent
// `8c7ca5e9f`, and no legacy descriptor was carved into it — so there is no legacy population to compare, no set
// difference, and no legacy SHA to record.

import type { Node, SourceFile } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { CONVERSION_REFUSAL_BINDING } from "../contract/conversion-refusal.ts";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import { GATE_RESOURCE_REQUEST_KINDS } from "../contract/resource-declaration.ts";
import type { AuthoredBlocker, AuthoredRefusal } from "../lib/conversion-refusal.ts";
import { readAuthoredRefusal, refusalOpenerLine, stringPositionText } from "../lib/conversion-refusal.ts";

const GATES_DIR = "tooling/src/verify/gates/";
const VERIFY_DIR = "tooling/src/verify/**";

const MESSAGE =
  "a #1584 conversion refusal must be DATA whose blocker is re-derivable, and its blocker must still be true — a refusal is a SNAPSHOT and nothing else re-opens one when its blocker lands (#2013, #2017).";

const FIX =
  "declare `export const CONVERSION_REFUSAL` (contract/conversion-refusal.ts) beside the descriptor, with a `sole-consumer` blocker naming the read's code spellings, the scope it was censused over, and the modules that carried it; re-derive the consumer list when this reds, and CONVERT or DELETE the gate when the list grows past one (guide §4's reopen bar).";

interface ModuleFacts {
  readonly path: string;
  openerLine: number | undefined;
  refusal: AuthoredRefusal | undefined;
  converted: boolean;
  /** The declaration's own span, so the census can EXCLUDE it — see `outsideDeclaration`. */
  declarationStart: number;
  declarationEnd: number;
  /** Census spellings this module carries in a string position OUTSIDE its own refusal declaration. */
  readonly spellings: Set<string>;
}

function facts(state: Map<string, ModuleFacts>, path: string): ModuleFacts {
  const existing = state.get(path);
  if (existing !== undefined) {
    return existing;
  }
  const created: ModuleFacts = {
    path,
    openerLine: undefined,
    refusal: undefined,
    converted: false,
    declarationStart: -1,
    declarationEnd: -1,
    spellings: new Set<string>(),
  };
  state.set(path, created);
  return created;
}

/** THE DECLARATION IS NOT EVIDENCE OF ITSELF, and this fence is why the evidence direction of ARM B is
 *  falsifiable at all. A blocker authors its census spellings as STRING LITERALS (`spellings: ["--cached"]`),
 *  which sit in a string position inside the declaring module — so without this exclusion every declaring
 *  module is automatically its own consumer, the "recorded consumer no longer carries the read" direction
 *  can never fire for the one module that matters, and the arm reads green forever. Caught by `mustFlag[2]`
 *  coming back with zero findings on the first run of this policy's own proofs, which is exactly the clean
 *  zero the rest of this module is about. */
function outsideDeclaration(module: ModuleFacts, start: number): boolean {
  return module.declarationStart === -1 || start < module.declarationStart || start >= module.declarationEnd;
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1).replace(/\.ts$/, "");
}

/** The modules that carry ANY of `spellings` in a string position, within `under`. */
function censusConsumers(state: Map<string, ModuleFacts>, blocker: AuthoredBlocker): readonly string[] {
  const under = blocker.under ?? "";
  return [...state.values()]
    .filter((module) => module.path.startsWith(under) && blocker.spellings.some((spelling) => module.spellings.has(spelling)))
    .map((module) => module.path)
    .toSorted((a, b) => a.localeCompare(b));
}

/** ARM F — the #2013 tripwire, and the half of §12.4 this policy did not hold until #2116.
 *
 *  A refusal whose ground is "no shipped resource kind serves this read" names the kind it WOULD need. The
 *  claim is that the name is not in the frozen eighteen; the day it is, the refusal's stated reason is gone
 *  and the module is due a re-derivation. That is exactly what happened to `runner-config-path-liveness` —
 *  it refused citing a missing `authored-path` door, the door was SPECIFIED BY that refusal and shipped,
 *  and the gate still sat legacy and refusing because nothing re-opens a refusal when its blocker lands. */
function reportMissingKind(ctx: GatePolicyContext, module: ModuleFacts, blocker: AuthoredBlocker): void {
  const wouldBeKind = blocker.wouldBeKind;
  if (wouldBeKind === undefined) {
    return;
  }
  if ((GATE_RESOURCE_REQUEST_KINDS as readonly string[]).includes(wouldBeKind)) {
    ctx.report.node(blocker.node, {
      message: `${module.path}'s refusal rests on ${JSON.stringify(wouldBeKind)} not existing, and it is now a shipped GateResourceRequest kind — the capability this refusal cites HAS LANDED, so the refusal is a snapshot of a tree that no longer exists (#2013). Convert the module or re-derive the refusal.`,
    });
  }
}

function reportBlocker(ctx: GatePolicyContext, module: ModuleFacts, blocker: AuthoredBlocker, state: Map<string, ModuleFacts>): void {
  if (blocker.kind === "missing-kind") {
    reportMissingKind(ctx, module, blocker);
    return;
  }
  const under = blocker.under;
  if (under === undefined) {
    return;
  }
  if (![...state.keys()].some((path) => path.startsWith(under))) {
    ctx.report.node(blocker.node, {
      message: `${module.path}'s refusal censuses ${JSON.stringify(under)}, which admits NO file in this policy's population (${VERIFY_DIR}) — the census can only ever come back empty, which reads exactly like a refusal that still holds.`,
    });
    return;
  }
  const measured = censusConsumers(state, blocker);
  const declared = [...blocker.consumers].toSorted((a, b) => a.localeCompare(b));
  for (const path of measured.filter((entry) => !declared.includes(entry))) {
    ctx.report.node(blocker.node, {
      message: `${path} now performs the read this refusal turns on (${blocker.spellings.map((s) => JSON.stringify(s)).join(" or ")}) and the refusal does not record it. Guide §12.4's reopen bar is TWO or more independent consumers — re-derive the refusal rather than inheriting it.`,
    });
  }
  for (const path of declared.filter((entry) => !measured.includes(entry))) {
    ctx.report.node(blocker.node, {
      message: `${path} is recorded as performing the read this refusal turns on, and no longer carries any of ${blocker.spellings.map((s) => JSON.stringify(s)).join(", ")} in a code position — the refusal's own evidence is gone.`,
    });
  }
}

function reportModule(ctx: GatePolicyContext, module: ModuleFacts, state: Map<string, ModuleFacts>): void {
  const refusal = module.refusal;
  if (refusal === undefined) {
    if (module.openerLine !== undefined && module.path.startsWith(GATES_DIR)) {
      ctx.report.file(module.path, {
        line: module.openerLine,
        column: 1,
        message: `${module.path} records a conversion refusal in PROSE and declares no ${CONVERSION_REFUSAL_BINDING}, so nothing re-derives its blocker — which is the #2013 failure verbatim.`,
      });
    }
    return;
  }
  if (module.converted) {
    ctx.report.node(refusal.anchor, {
      message: `${module.path} calls defineGate and still declares a conversion refusal — the module converted and its refusal outlived it.`,
    });
    return;
  }
  // ARM D FAILS OPEN ON UNREADABLE, and the guard is the whole of #2106. This arm ACCUSES — it says the
  // author copied a refusal from another module — and an accusation needs the field to have been READ, not
  // merely to differ from `undefined`. Without the `!== undefined` it fired on every declaration the reader
  // could not parse, which on 2026-09-12 was the ONE live declaration, on a HARD policy whose only
  // author-side move is a waiver. An unreadable `gate` is already reported by ARM E, exactly once, as what
  // it is: "I could not read this", never "you wrote the wrong thing". Two arms, two claims, no double
  // accusation. The ARM E row below is what keeps this fail-open from becoming a silent skip.
  if (refusal.gate !== undefined && refusal.gate !== basename(module.path)) {
    ctx.report.node(refusal.anchor, {
      message: `the refusal names gate ${JSON.stringify(refusal.gate)} and this module's id is ${JSON.stringify(basename(module.path))} — a refusal copied between modules accuses the one it came from.`,
    });
  }
  for (const reason of refusal.malformed) {
    ctx.report.node(refusal.anchor, {
      message: `the refusal declaration could not be read as contract/conversion-refusal.ts's shape: ${reason}. An unreadable declaration is exactly as unheld as no declaration at all.`,
    });
  }
  for (const blocker of refusal.blockers) {
    reportBlocker(ctx, module, blocker, state);
  }
}

export const gate = defineGate({
  id: "conversion-refusal-liveness",
  family: "conversion-refusal-liveness",
  authority: "hard",
  severity: "error",
  population: { in: ["@tooling"], under: [VERIFY_DIR], ext: ["ts"] },
  analysis: "syntax",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const state = new Map<string, ModuleFacts>();
    /** Every spelling any declared blocker asks about, collected on the first pass so the string visitor
     *  records only what some refusal actually censuses rather than every string in the verify tree. Two
     *  passes are not available inside one walk, so the visitor records the module's whole string set only
     *  for the spellings it is asked about — see `noteSpelling`. */
    const wanted = new Set<string>();
    /** Every string-position token, WITH its start offset, because the declaration-exclusion fence is a
     *  span test and the declaration may be visited after the tokens inside it. */
    const seenStrings = new Map<string, { text: string; start: number }[]>();
    const noteSpelling = (path: string, text: string, start: number): void => {
      const bucket = seenStrings.get(path) ?? [];
      bucket.push({ text, start });
      seenStrings.set(path, bucket);
    };
    return {
      visitFile: (sourceFile) => {
        const module = facts(state, ctx.relativePath(sourceFile));
        module.openerLine = refusalOpenerLine(sourceFile);
      },
      visitors: [
        {
          kinds: [SyntaxKind.VariableDeclaration],
          visit: (node: Node, sourceFile: SourceFile) => {
            if (!node.isKind(SyntaxKind.VariableDeclaration) || node.getName() !== CONVERSION_REFUSAL_BINDING) {
              return;
            }
            const initializer = node.getInitializer();
            if (initializer === undefined) {
              return;
            }
            const module = facts(state, ctx.relativePath(sourceFile));
            const refusal = readAuthoredRefusal(node.getNameNode(), initializer);
            module.refusal = refusal;
            module.declarationStart = node.getStart();
            module.declarationEnd = node.getEnd();
            for (const blocker of refusal.blockers) {
              for (const spelling of blocker.spellings) {
                wanted.add(spelling);
              }
            }
          },
        },
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node: Node, sourceFile: SourceFile) => {
            if (node.isKind(SyntaxKind.CallExpression) && node.getExpression().getText() === "defineGate") {
              facts(state, ctx.relativePath(sourceFile)).converted = true;
            }
          },
        },
        {
          kinds: [
            SyntaxKind.StringLiteral,
            SyntaxKind.NoSubstitutionTemplateLiteral,
            SyntaxKind.TemplateHead,
            SyntaxKind.TemplateMiddle,
            SyntaxKind.TemplateTail,
          ],
          visit: (node: Node, sourceFile: SourceFile) => {
            const text = stringPositionText(node);
            if (text !== undefined) {
              noteSpelling(ctx.relativePath(sourceFile), text, node.getStart());
            }
          },
        },
      ],
      evaluate: () => {
        for (const [path, tokens] of seenStrings) {
          const module = state.get(path);
          if (module === undefined) {
            continue;
          }
          const outside = tokens.filter((token) => outsideDeclaration(module, token.start));
          for (const spelling of wanted) {
            if (outside.some((token) => token.text.includes(spelling))) {
              module.spellings.add(spelling);
            }
          }
        }
        ctx.receipt({ kind: "population", source: "verify-modules", members: state.size });
        for (const module of state.values()) {
          reportModule(ctx, module, state);
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "source",
      files: {
        "tooling/src/verify/gates/probe-anchor.ts": "export const anchor = 1;\n",
        "tooling/src/verify/gates/probe-refuser.ts":
          "// Gate: probe-refuser — the fixture's stand-in header.\n// CONVERSION TO `defineGate` REFUSED 2026-09-12 (#1930): no shipped kind serves the read.\nexport const descriptor = 1;\n",
      },
      expect: { count: 1, line: 2, messageIncludes: "records a conversion refusal in PROSE" },
      why: "ARM A — a refusal that is only prose is the defect this policy exists for, and the anchor file keeps the population non-empty so the fence is falsifiable at all",
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/gates/probe-anchor.ts": "export const anchor = 1;\n",
        "tooling/src/verify/gates/probe-refuser.ts":
          'export const CONVERSION_REFUSAL = {\n  gate: "probe-refuser",\n  issue: "#1930",\n  rederived: "2026-09-12",\n  why: "no shipped kind serves the read",\n  blockers: [{ kind: "sole-consumer", why: "the read", under: "tooling/src/verify/", spellings: ["--probe-read"], consumers: ["tooling/src/verify/gates/probe-refuser.ts"] }],\n  unheld: [],\n};\nexport const descriptor = ["--probe-read"];\n',
        "tooling/src/verify/lib/probe-newcomer.ts": 'export const argv = ["--probe-read"];\n',
      },
      expect: { count: 1, messageIncludes: "reopen bar is TWO or more independent consumers" },
      why: "ARM B, the REOPEN direction — a second module performs the read and the refusal does not record it, which is the §12.4 condition the whole refusal rests on",
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/gates/probe-anchor.ts": "export const anchor = 1;\n",
        "tooling/src/verify/gates/probe-refuser.ts":
          'export const CONVERSION_REFUSAL = {\n  gate: "probe-refuser",\n  issue: "#1930",\n  rederived: "2026-09-12",\n  why: "no shipped kind serves the read",\n  blockers: [{ kind: "sole-consumer", why: "the read", under: "tooling/src/verify/", spellings: ["--probe-read"], consumers: ["tooling/src/verify/gates/probe-refuser.ts"] }],\n  unheld: [],\n};\n// the read is gone: nothing here spells it in a code position any more.\nexport const descriptor = 1;\n',
      },
      expect: { count: 1, messageIncludes: "the refusal's own evidence is gone" },
      why: "ARM B, the EVIDENCE direction — the recorded consumer stopped performing the read, so the census that justified the refusal no longer reproduces. The comment mentioning it is deliberately present and deliberately does NOT count",
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/gates/probe-anchor.ts": "export const anchor = 1;\n",
        "tooling/src/verify/gates/probe-refuser.ts":
          'import { defineGate } from "../contract/policy.ts";\nexport const CONVERSION_REFUSAL = {\n  gate: "probe-refuser",\n  issue: "#1930",\n  rederived: "2026-09-12",\n  why: "no shipped kind serves the read",\n  blockers: [{ kind: "sole-consumer", why: "the read", under: "tooling/src/verify/", spellings: ["--probe-read"], consumers: ["tooling/src/verify/gates/probe-refuser.ts"] }],\n  unheld: [],\n};\nexport const gate = defineGate({ id: "probe-refuser" });\n',
      },
      expect: { count: 1, messageIncludes: "the module converted and its refusal outlived it" },
      why: "ARM C — the #2013 failure inverted, and the one arm that makes a shrinking refusal population safe: the module converts and nothing is left claiming it did not",
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/gates/probe-anchor.ts": "export const anchor = 1;\n",
        "tooling/src/verify/gates/probe-refuser.ts":
          'export const CONVERSION_REFUSAL = {\n  gate: "some-other-gate",\n  issue: "#1930",\n  rederived: "2026-09-12",\n  why: "no shipped kind serves the read",\n  blockers: [{ kind: "sole-consumer", why: "the read", under: "tooling/src/verify/", spellings: ["--probe-read"], consumers: ["tooling/src/verify/gates/probe-refuser.ts"] }],\n  unheld: [],\n};\nexport const descriptor = ["--probe-read"];\n',
      },
      expect: { count: 1, messageIncludes: "a refusal copied between modules accuses the one it came from" },
      why: "ARM D — the loader requires id === basename, so a refusal naming another gate is a copy, and its census then measures the wrong module",
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/gates/probe-anchor.ts": "export const anchor = 1;\n",
        "tooling/src/verify/gates/probe-refuser.ts":
          'export const CONVERSION_REFUSAL = {\n  gate: "probe-refuser",\n  issue: "#1930",\n  rederived: "2026-09-12",\n  why: "no shipped kind serves the read",\n  blockers: [{ kind: "sole-consumer", why: "the read", under: "packages/server/src/", spellings: ["--probe-read"], consumers: [] }],\n  unheld: [],\n};\nexport const descriptor = 1;\n',
      },
      expect: { count: 1, messageIncludes: "admits NO file in this policy's population" },
      why: "ARM E — a blocker scoped outside the population would census an empty set and pass forever, which is the same clean-zero-is-not-a-measurement defect the rest of this policy is about",
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/gates/probe-anchor.ts": "export const anchor = 1;\n",
        "tooling/src/verify/gates/probe-refuser.ts":
          'export const CONVERSION_REFUSAL = {\n  gate: "probe-refuser",\n  issue: "#1930",\n  rederived: "2026-09-12",\n  why: "no shipped kind serves the read",\n  blockers: [{ kind: "missing-kind", why: "the read", wouldBeKind: "tracked-files" }],\n  unheld: [],\n};\nexport const descriptor = 1;\n',
      },
      expect: { count: 1, messageIncludes: "HAS LANDED" },
      why: "ARM F — the #2013 failure itself: the refusal rests on a kind not existing and `tracked-files` is one of the frozen eighteen, so the capability it cites has shipped and nothing else would re-open it. The fixture names a REAL member, so the row dies the day the kind list is read from somewhere other than the contract",
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/gates/probe-anchor.ts": "export const anchor = 1;\n",
        "tooling/src/verify/gates/probe-refuser.ts":
          'export const CONVERSION_REFUSAL = {\n  gate: "probe" + "-refuser",\n  issue: "#1930",\n  rederived: "2026-09-12",\n  why: "no shipped kind serves the read",\n  blockers: [{ kind: "sole-consumer", why: "the read", under: "tooling/src/verify/", spellings: ["--probe-read"], consumers: ["tooling/src/verify/gates/probe-refuser.ts"] }],\n  unheld: [],\n};\nexport const descriptor = ["--probe-read"];\n',
      },
      // COUNT 1 IS THE ASSERTION, not the message. ARM D must stay SILENT here: before #2106 an unreadable
      // `gate` read as `undefined !== "probe-refuser"` and this fixture produced TWO findings, the second
      // of them accusing the author of copying a refusal they wrote themselves.
      expect: { count: 1, messageIncludes: "`gate` is not a statically readable string" },
      why: "ARM E, and the FAIL-OPEN boundary: a MACHINE field the reader cannot read is reported ONCE, as a read failure, and the accusing arm says nothing. This is also the discrimination the repair rests on — a concatenated MACHINE field still reports while a concatenated PROSE field does not (the last mustPass row)",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "tooling/src/verify/gates/probe-anchor.ts": "export const anchor = 1;\n",
        "tooling/src/verify/gates/probe-refuser.ts":
          'export const CONVERSION_REFUSAL = {\n  gate: "probe-refuser",\n  issue: "#1930",\n  rederived: "2026-09-12",\n  why: "no shipped kind serves the read",\n  blockers: [{ kind: "sole-consumer", why: "the read", under: "tooling/src/verify/", spellings: ["--probe-read"], consumers: ["tooling/src/verify/gates/probe-refuser.ts"] }],\n  unheld: ["the reader-design half is a ruling, not a census"],\n};\nexport const descriptor = ["--probe-read"];\n',
      },
      why: "a declared refusal whose census reproduces exactly — the sole consumer is the declaring module itself, which is §12.4's one-consumer condition holding",
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/gates/probe-anchor.ts": "export const anchor = 1;\n",
        "tooling/src/verify/gates/probe-refuser.ts":
          'export const CONVERSION_REFUSAL = {\n  gate: "probe-refuser",\n  issue: "#1930",\n  rederived: "2026-09-12",\n  why: "no shipped kind serves the read",\n  blockers: [{ kind: "sole-consumer", why: "the read", under: "tooling/src/verify/", spellings: ["--probe-read"], consumers: ["tooling/src/verify/gates/probe-refuser.ts"] }],\n  unheld: [],\n};\nexport const descriptor = ["--probe-read"];\n',
        "tooling/src/verify/lib/probe-mentioner.ts": "// this module talks ABOUT `--probe-read` and never performs it.\nexport const unrelated = 1;\n",
      },
      why: "THE CENSUS FENCE: a module whose only occurrence of the spelling is in a COMMENT is not a consumer. Cut `stringPositionText` to a raw-text scan and this row reds with the reopen-bar message — which is the direction that matters, because a raw-text census also scores the two real refusal headers' own narration",
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/gates/probe-anchor.ts": "export const anchor = 1;\n",
        "tooling/src/verify/gates/probe-converted.ts":
          "// Gate: probe-converted — the legacy header refused conversion on a capability that has since shipped.\n// CONVERSION, 2026-09-12 (#1584): what it retires.\nexport const descriptor = 1;\n",
      },
      why: "THE OPENER'S CASE FENCE: `// CONVERSION,` narrating a COMPLETED conversion, with `refused` only in lowercase prose, is not a refusal — this is `runner-config-path-liveness.ts:26`'s real shape, and it is why the two-module population is a measurement rather than a grep",
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/gates/probe-anchor.ts": "export const anchor = 1;\n",
        "tooling/src/verify/gates/probe-refuser.ts":
          'export const CONVERSION_REFUSAL = {\n  gate: "probe-refuser",\n  issue: "#1930",\n  rederived: "2026-09-12",\n  why:\n    "a sentence past the line cap, so the house style splits it with a plus, " +\n    "which is also exactly what the biome formatter produces.",\n  blockers: [\n    {\n      kind: "sole-consumer",\n      why:\n        "the blocker prose is split the same way, " +\n        "and the census must not care.",\n      under: "tooling/src/verify/",\n      spellings: ["--probe-read"],\n      consumers: ["tooling/src/verify/gates/probe-refuser.ts"],\n    },\n  ],\n  unheld: ["the reader-design half is a ruling, not a census"],\n};\nexport const descriptor = ["--probe-read"];\n',
      },
      why: "THE #2106 REGRESSION PIN — the EXACT live shape. `why` is a CONCATENATED string at both the declaration and the blocker level, which is the house spelling for any sentence past the line cap and what the biome formatter emits. `readStaticAuthoredValue` is ATOMIC over an object literal, so before the repair this one prose field made the whole declaration unreadable and the policy reported TWO findings against correct code on a HARD gate, whose only author-side move would have been a waiver. Nothing here is machine-read; the prose presence is held by `satisfies ConversionRefusal` at compile time instead",
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/gates/probe-anchor.ts": "export const anchor = 1;\n",
        "tooling/src/verify/gates/probe-refuser.ts":
          'export const CONVERSION_REFUSAL = {\n  gate: "probe-refuser",\n  issue: "#1930",\n  rederived: "2026-09-12",\n  why: "no shipped kind serves the read",\n  blockers: [{ kind: "missing-kind", why: "the read", wouldBeKind: "staged-blob" }],\n  unheld: [],\n};\nexport const descriptor = 1;\n',
      },
      why: "ARM F, the surviving direction — `staged-blob` is not a member of the frozen eighteen, which is the claim, so the refusal stands. Note the blocker declares no `under` and no `spellings` and is NOT accused of missing them: the malformed rules are per KIND, or a well-formed `missing-kind` blocker would be reported for fields it does not own",
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/gates/probe-anchor.ts": "export const anchor = 1;\n",
        "tooling/src/verify/gates/probe-quoter.ts":
          "// Gate: probe-quoter — an ordinary header with no refusal in it.\nexport const descriptor = 1;\n// CONVERSION TO `defineGate` REFUSED 2026-09-12 (#1930): quoted BELOW the first statement.\n",
      },
      why: "THE HEADER-SPAN FENCE (§4.1). `refusalOpenerLine` scopes to everything before the first statement, so a module QUOTING the grammar further down — in a comment beside the code it is describing — is an inert mention. Cut the span scoping to a whole-file scan and this row reds with ARM A's message, which is what it had no proof of before",
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/gates/probe-anchor.ts": "export const anchor = 1;\n",
        "tooling/src/verify/lib/probe-reader.ts":
          "// Reader: probe-reader.\n// CONVERSION TO `defineGate` REFUSED 2026-09-12 (#1930): a lib module is not a gate module.\nexport const read = 1;\n",
      },
      why: "THE `GATES_DIR` FENCE ON ARM A (§4.1). The population is the whole verify tree because ARM B needs a census over it, so a `lib/` module IS admitted — but only a GATE module can refuse to convert, and a refusal opener anywhere else is prose. Drop the fence and this row reds; the anchor file keeps the population non-empty so the fence is falsifiable at all",
    },
  ],
});

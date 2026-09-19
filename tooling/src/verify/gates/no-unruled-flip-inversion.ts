// Gate: no-unruled-flip-inversion (#1089) — the FLIP-INVERSION dance (write an inverse `transform` inline,
// force a reflow to flush it, let CSS run it home) is a RULED two-member exception class, and until now the
// ruling was prose only: motion-and-animation-guide.md §1.5 says "Two sites, and they are the whole
// exception class … Anything else that reaches for JS to move pixels is a defect, not a third member", and
// nothing made a third member RED. This policy is that ruling made structural.
// ARM: one finding per `<expr>.style.transform = …` write (dot or string-literal computed) that is FOLLOWED,
// inside the SAME enclosing function, by a forced-reflow read — `offsetWidth` / `offsetHeight` /
// `getBoundingClientRect()`. The pair is the tell: a transform write alone is ordinary inline styling, and a
// reflow read alone is measurement; the two in sequence is the inversion flush and nothing else.
// DELIBERATE WIDENING vs the row's wording ("in the same block"): the unit is the enclosing FUNCTION, so
// wrapping the flush read in an `if`/`try` block is not a bypass. Every mustPass row below stays green under it.
// DECLARED LIMITS, each with a mustPass row: a reflow read that PRECEDES the write is a measure-then-set, not
// a flush (that is the shape the tabs site's own clear leg takes, and it must not double-report); the read
// vocabulary is the three members above, so `getComputedStyle`/`scrollTop` spellings are outside it; a write
// and a read split across two functions is not seen.
// FAMILY: a declared SINGLETON under its own id — no sibling policy judges a transform write or a
// forced-reflow read, and the §1.5 class has exactly one subject and one reader.
// POPULATION: NEW policy, no legacy predecessor and therefore no port. `@ui` + `@client`, the two packages
// §1.5 rules; the guide's other member (`use-list-track-flip.ts`) is CSS-owned and writes no transform at
// all, which is why it passes here rather than needing a second grant.
// AUTHORITY: `reviewed-grant`, NOT an allowlist. §1.5 is a RULING, so a third genuine FLIP site is an exact
// `(subject, operation)` row with `why` + `endsWhen` in `lib/reviewed-grants-no-unruled-flip-inversion.ts` —
// which also gives the rename/move tripwire a prose list cannot: central liveness reports the row stale the
// day `glideIndicator` stops taking this shape. Born green: the tree holds exactly one matching site
// (`packages/ui/src/primitives/tabs/tabs.tsx`, measured 2026-09-19 with ast-grep over `ts` — 0 matches,
// scannedFileCount=6441 — and `tsx` — 2 matches, scannedFileCount=1414 — corroborated by a literal `rg`).
// COUPLED SITE: the §1.5 exception list is the ruling of record. Amend the list and the grant together,
// never one alone.
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { MEMBER_ACCESS_KINDS, readMemberAccess, readsMemberNamed } from "../lib/symbol-reference.ts";

const TRANSFORM = "transform";
const STYLE = "style";
const OPERATION = "flip-inversion";

/** The reads that force a synchronous layout flush. Deliberately the three §1.5 names a FLIP actually uses
 *  (the tabs site's comment records that "all four flush spellings work"); a wider list would start
 *  conscripting ordinary measurement into the accusation without making a third FLIP site any more visible. */
const FORCED_REFLOW_READS: ReadonlySet<string> = new Set(["offsetWidth", "offsetHeight", "getBoundingClientRect"]);

const MESSAGE =
  "a FLIP INVERSION outside the ruled exception class — an inline `transform` write flushed by a forced " +
  "layout read is JS moving pixels, and motion-and-animation-guide.md §1.5 admits exactly two sites as the " +
  'whole class ("anything else that reaches for JS to move pixels is a defect, not a third member"). If the ' +
  "delta can be spelled in CSS, the answer is the shell's shape: stamp a data attribute and let the " +
  "keyframes own the distance (packages/client/src/features/app-shell/hooks/use-list-track-flip.ts).";

const FIX =
  "prefer the CSS-owned shape — stamp a `data-*` attribute and put the distance in a stylesheet var, the way " +
  "packages/client/src/features/app-shell/hooks/use-list-track-flip.ts does. If the delta is genuinely two " +
  "runtime boxes and no CSS value expresses it, this is a RULING, not a lint: amend " +
  "motion-and-animation-guide.md §1.5's exception list AND add the exact row to " +
  "tooling/src/verify/lib/reviewed-grants-no-unruled-flip-inversion.ts with its `why` and `endsWhen` — never " +
  "one without the other.";

/** The authored name slice of a `transform` write whose receiver is a `style` read — EVERY spelling of both
 *  halves, through the shared `readMemberAccess`: `x.style.transform`, `x.style["transform"]`,
 *  `x["style"].transform`, `x?.style?.transform`, and a same-file `const KEY = "transform"` hop. A
 *  dot-only reader here is the #1506 spelling hole, and the gate-spelling-twins census reds it. */
function styleWriteTarget(left: MorphNode): MorphNode | undefined {
  const read = readMemberAccess(left);
  if (read === undefined || read.name !== TRANSFORM) {
    return;
  }
  // The receiver is deliberately unconstrained beyond its NAME — `node.style`, `ref.current.style` and
  // `this.el.style` are one shape and one defect.
  return readMemberAccess(read.receiver)?.name === STYLE ? read.nameNode : undefined;
}

/** The nearest enclosing function-like body, which is the window the write and its flush share. */
function enclosingFunction(node: MorphNode): MorphNode | undefined {
  return node.getFirstAncestor(
    (ancestor) =>
      Node.isFunctionDeclaration(ancestor) ||
      Node.isFunctionExpression(ancestor) ||
      Node.isArrowFunction(ancestor) ||
      Node.isMethodDeclaration(ancestor) ||
      Node.isConstructorDeclaration(ancestor),
  );
}

/** Is this node a forced-reflow read? `getBoundingClientRect` is counted at the member access rather than at
 *  the call, so all three members are one comparison and an unparenthesised reference reads the same — and
 *  the shared reader answers for `el["offsetWidth"]` and `el?.offsetWidth` as readily as for the dot form. */
function isForcedReflowRead(node: MorphNode): boolean {
  return readsMemberNamed(node, FORCED_REFLOW_READS) !== undefined;
}

interface TransformWrite {
  readonly file: SourceFile;
  readonly anchor: MorphNode;
  readonly scope: MorphNode;
  readonly start: number;
}

export const gate = defineGate({
  id: "no-unruled-flip-inversion",
  family: "no-unruled-flip-inversion",
  authority: "reviewed-grant",
  severity: "error",
  population: ["@ui", "@client"],
  analysis: "syntax",
  // The verdict is a WITHIN-FILE sequence: the write, its flush read and their shared function body all live
  // in one source file, so a selected subset carries the whole answer.
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const writes: TransformWrite[] = [];
    const reads: { readonly scope: MorphNode; readonly start: number }[] = [];
    return {
      visitors: [
        {
          // BOTH member-access kinds, never `PropertyAccessExpression` alone — that is the #1506 hole, and
          // the gate-spelling-twins census reds a gate that ships it.
          kinds: [SyntaxKind.BinaryExpression, ...MEMBER_ACCESS_KINDS],
          visit: (node, sourceFile) => {
            if (isForcedReflowRead(node)) {
              const scope = enclosingFunction(node);
              if (scope !== undefined) {
                reads.push({ scope, start: node.getStart() });
              }
              return;
            }
            if (!Node.isBinaryExpression(node) || node.getOperatorToken().getKind() !== SyntaxKind.EqualsToken) {
              return;
            }
            const anchor = styleWriteTarget(node.getLeft());
            const scope = anchor === undefined ? undefined : enclosingFunction(node);
            if (anchor !== undefined && scope !== undefined) {
              writes.push({ file: sourceFile, anchor, scope, start: node.getStart() });
            }
          },
        },
      ],
      evaluate: () => {
        for (const write of writes) {
          // ORDER IS THE PREDICATE: a read BEFORE the write is a measure-then-set (and is what the tabs
          // site's own clear leg does), so only a read that follows the write is a flush.
          const flushed = reads.some((read) => read.scope === write.scope && read.start > write.start);
          if (!flushed) {
            continue;
          }
          const text = write.anchor.getText();
          ctx.report.node(write.anchor, {
            token: text,
            offset: 0,
            subject: ctx.relativePath(write.file),
            operation: OPERATION,
          });
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "source",
      files: {
        "packages/ui/src/primitives/tabs/tabs.tsx":
          "export function glide(node: HTMLElement, dx: number): void {\n" +
          '  node.style.transitionProperty = "none";\n' +
          "  node.style.transform = `translateX(${String(dx)}px)`;\n" +
          "  node.getBoundingClientRect();\n" +
          '  node.style.transform = "";\n' +
          "}\n",
      },
      expect: { count: 1, token: TRANSFORM },
      grant: { subject: "packages/ui/src/primitives/tabs/tabs.tsx", operation: OPERATION },
      why: "THE RULED SITE, in its own authored shape: an inverse transform, a `getBoundingClientRect()` flush, then a clear. Exactly ONE finding even though the fixture writes `transform` twice — the clear leg has no read after it, which is the ORDER half of the predicate and the reason a single grant can license this file. The witness is the exact central row `glideIndicator` carries, so the row proves the emitted identity is bindable at all",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/gallery/lib/third-member.ts":
          "export function slide(el: HTMLElement, dx: number): void {\n" +
          "  el.style.transform = `translateX(${String(dx)}px)`;\n" +
          "  const w = el.offsetWidth;\n" +
          "  void w;\n" +
          '  el.style.transform = "";\n' +
          "}\n",
      },
      expect: { count: 1, token: TRANSFORM },
      why: "THE DEFECT THE RULING NAMES — a THIRD FLIP site, in `@client` and flushed through the other read spelling (`offsetWidth`). This is the row the whole policy exists for: before it, a third member was catchable only by a human who had read §1.5",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/gallery/lib/computed.ts":
          "export function slide(el: HTMLElement, dx: number): void {\n" +
          '  el.style["transform"] = `translateX(${String(dx)}px)`;\n' +
          "  if (dx > 0) {\n" +
          "    void el.offsetHeight;\n" +
          "  }\n" +
          '  el.style["transform"] = "";\n' +
          "}\n",
      },
      // The authored slice of a computed write is the string literal INCLUDING its quotes — that is what a
      // waiver would have to name, so the row pins it exactly rather than the bare property name.
      expect: { count: 1, token: `"${TRANSFORM}"` },
      why: 'THE TWO BYPASSES IN ONE ROW: a COMPUTED member write (`style["transform"]`, invisible to a dot-only reader) and a flush read nested in an `if` BLOCK (invisible to a same-block reader — the deliberate widening to the enclosing FUNCTION). Either alone would walk a third member straight past the gate',
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "packages/client/src/features/app-shell/hooks/use-list-track-flip.ts":
          "export function useListTrackFlip(el: HTMLElement, open: boolean): void {\n" +
          '  el.dataset["listFlip"] = open ? "in" : "out";\n' +
          "  void el.offsetWidth;\n" +
          "}\n",
      },
      why: "THE OTHER RULED MEMBER, and it needs NO grant: the shell's push stamps a data attribute and lets `shell.css` own the distance, so it writes no transform at all. The row that dies if the predicate is widened from the write+read PAIR to either half — and the shape the message prescribes as the preferred answer",
    },
    {
      mode: "source",
      files: {
        "packages/ui/src/primitives/card/card.tsx": 'export function park(el: HTMLElement): void {\n  el.style.transform = "translateY(0)";\n}\n',
      },
      why: "a transform write with NO flush read is ordinary inline styling — the half of the pair that is not a FLIP. Accusing it would red every `style.transform` in the tree and make the gate a `no-inline-transform` rule nobody ruled",
    },
    {
      mode: "source",
      files: {
        "packages/ui/src/primitives/card/card.tsx":
          "export function measureThenSet(el: HTMLElement): void {\n" +
          "  const width = el.offsetWidth;\n" +
          "  el.style.transform = `scaleX(${String(width / 100)})`;\n" +
          "}\n",
      },
      why: "ORDER, the declared limit made a pin: a read BEFORE the write is a measure-then-set, not a flush. Without the order clause the ruled site's own CLEAR leg would double-report and one grant could never license the file (an over-broad grant licenses NOTHING)",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/gallery/lib/split.ts":
          "export function write(el: HTMLElement, dx: number): void {\n" +
          "  el.style.transform = `translateX(${String(dx)}px)`;\n" +
          "}\n" +
          "export function flush(el: HTMLElement): void {\n" +
          "  void el.offsetWidth;\n" +
          "}\n",
      },
      why: "DECLARED LIMIT — a write and a read split across two FUNCTIONS is not seen. Pairing them across call boundaries needs binding/origin resolution this syntax-tier policy does not have, and the honest baseline is written here rather than assumed",
    },
    {
      mode: "source",
      files: {
        "packages/ui/src/primitives/card/card.tsx": 'export function opacity(el: HTMLElement): void {\n  el.style.opacity = "0";\n  void el.offsetWidth;\n}\n',
      },
      why: "the SUBJECT fence: a non-transform inline write flushed by a reflow read is not a FLIP inversion — §1.5 rules pixels MOVED by JS, and an opacity flush moves nothing. The row that dies if the property name is dropped from the predicate",
    },
  ],
});

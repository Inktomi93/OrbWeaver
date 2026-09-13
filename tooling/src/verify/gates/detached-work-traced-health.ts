// Policy: detached-work-traced-health — the BLINDNESS TRIPWIRE half of the `detached-work-traced` family
// (arm A4). The occurrence policy keys on a vocabulary DERIVED from the tracing module: an exported
// function that calls OTel's `startActiveSpan` with `root: true`, directly or through another derived
// boundary. A gate keyed on a derivation that stops resolving reports ✓ forever, so ZERO derived openers is
// itself the finding.
//
// FAMILY `detached-work-traced`, reader `lib/detached-work.ts#deriveRootSpanOpeners` — the same function
// the occurrence policy calls, which is what makes it a shared reader with two independent consumers rather
// than one module's private machinery at a `lib/` address (§5b.7).
//
// WHY A SEPARATE MODULE RATHER THAN A FOURTH ARM: AUTHORITY. The occurrence arms are `ordinary` — a
// deliberate teardown that is invisible on purpose is waivable with a reason and an end condition. This arm
// is `hard` and must be: a waiver here would silence the detector's own liveness, which is the exact rot
// two-sided gates exist to prevent. §12.1 allows one authority per descriptor, so the arms split and the
// family string keeps them visible as one law. It is also `hard` for a second, structural reason — the
// finding is FILE-anchored (the derivation SOURCE is the subject; there is no offending node), and a
// file-level finding has no ordinary door at all: `locateFinding` requires authored text at the finding's
// exact line and column (§3).
//
// POPULATION PORT: the legacy descriptor ran this arm inside `finalize`, fenced by
// `ctx.scope.kind !== "project"` plus a real-tree anchor probe (`fileLoaded(ctx, "packages/db/src/schema/
// index.ts")`) — a hand-rolled stand-in for "this run saw the whole tree", needed because the legacy
// runtime had no way to say so. `execution: "entire-population"` IS that statement, natively: a narrowed
// request DEFERS this policy instead of letting it fire on a subset. The anchor probe and the scope test
// are DELETED, not moved, and the population is the legacy `scanRoot`'s own `packages/server/src/`.
//
// The old anchor had to be a file the policy's own proof fixtures never plant (the legacy A4 example plants
// the tracing module itself, so anchoring there would have fired the arm inside the gate's own self-proof).
// Under the final contract that whole problem dissolves: the finding is reported ON the tracing module,
// the A4 fixture plants exactly that file with `root: true` removed, and the fixture is the subject rather
// than a bystander.
//
// AND THE TRACING MODULE'S ABSENCE IS A TOOL ERROR, NOT A SILENT PASS. `report.file` refuses a path outside
// the effective population (§12.3), and a run in which the derivation SOURCE does not exist is a run this
// policy cannot render a verdict for — the one condition under which a blindness tripwire must not report
// clean. It throws, naming the module.
//
// §4.6 SPLIT DIFFERENTIAL — and per §4.6's own warning that a split's differential is WEAKEST where it
// feels strongest, this arm's legacy coverage is stated per example rather than in prose: the legacy
// descriptor had exactly ONE example that loaded this arm (`mustFlag[8]`, the tracing module with
// `root: true` dropped), it replays here byte-identically apart from the finding's FILE (legacy anchored on
// the gate module's own path, final anchors on the derivation source), and the legacy row ALSO carried a
// second finding from the occurrence arms that now belongs to the sibling policy. Every other legacy
// example exercised this arm ZERO times. The measured replay is in the landing commit message.
import { defineGate } from "../contract/policy.ts";
import { deriveRootSpanOpeners, TRACING_MODULE } from "../lib/detached-work.ts";

const OTEL_ROOT_OPENER = "startActiveSpan";

const BLIND =
  `detached-work-traced derived ZERO root-span openers from ${TRACING_MODULE} — no exported function there ` +
  `calls \`${OTEL_ROOT_OPENER}\` with \`root: true\`, so the family is scanning for a vocabulary that no ` +
  "longer exists and has gone silently green. Re-point the derivation in tooling/src/verify/lib/detached-work.ts.";

const FIX =
  "restore a detached root in packages/server/src/foundation/observability/tracing.ts (an exported function calling `startActiveSpan(name, { …, root: true }, fn)`), or — if the detach genuinely moved — re-point `deriveRootSpanOpeners` in tooling/src/verify/lib/detached-work.ts at its new home. There is no waiver: silencing this arm silences the occurrence policy's own liveness.";

export const gate = defineGate({
  id: "detached-work-traced-health",
  family: "detached-work-traced",
  authority: "hard",
  severity: "error",
  population: "@server",
  // `types`, NOT `syntax` (#2256, corrected 2026-09-13). This policy derives its subject through
  // `lib/detached-work.ts#deriveRootSpanOpeners`, which reaches `staticStringValue` —
  // `node.getType().getLiteralValue()` plus `value.getSymbol()`. Asking a node for its TYPE is the checker,
  // so the old `syntax` declaration was false about the plane this verdict rests on. `analysis` is data the
  // runtime dispatches on and it fixes the proof MODE every row carries
  // (`lib/policy-validation.ts#expectedMode`), so the four proof rows below moved from `mode: "source"` to
  // `mode: "types"` in the same commit and were re-run.
  analysis: "types",
  // The verdict is a claim about the WHOLE derivation source; a subset that happens to exclude the tracing
  // module would otherwise report blindness on every scoped run.
  execution: "entire-population",
  facts: [],
  resources: [],
  message: BLIND,
  fix: FIX,
  create: (ctx) => ({
    evaluate: (): void => {
      const source = ctx.files.find((sourceFile) => sourceFile.getFilePath().includes(TRACING_MODULE));
      if (source === undefined) {
        throw new Error(
          `detached-work-traced-health cannot render a verdict: its derivation source ${TRACING_MODULE} is not in the effective population, so "zero openers" is unmeasurable rather than false (tooling/src/verify/gates/detached-work-traced-health.ts)`,
        );
      }
      if (deriveRootSpanOpeners(ctx.files).size === 0) {
        ctx.report.file(ctx.relativePath(source), { message: BLIND, fix: FIX });
      }
    },
  }),
  mustFlag: [
    {
      mode: "types",
      files: {
        [TRACING_MODULE]: "export function withRequestSpan(id: string, fn: () => Promise<void>): Promise<void> {\n  return t.startActiveSpan(id, {}, fn);\n}\n",
      },
      expect: { count: 1, line: 1 },
      why: 'A4 — the tracing module dropped `root: true`, so the derived vocabulary is EMPTY and the occurrence policy would report ✓ forever on a tree it can no longer read. This is the legacy `mustFlag[8]` arm, minus the real-tree anchor probe the final `execution: "entire-population"` replaces; the finding now lands ON the derivation source rather than on the gate module\'s own path',
    },
    {
      mode: "types",
      files: {
        [TRACING_MODULE]:
          "export function withRequestSpan(id: string, name: string, attrs: A, fn: () => Promise<void>): Promise<void> {\n" +
          "  return t.startActiveSpan(name, { attributes: attrs, root: false }, fn);\n}\n",
      },
      expect: { count: 1, line: 1 },
      why: "AN INVENTED ROW WITH A PLANTED-BREAK RECEIPT IN THE REPORT (§4.7), and the one that pins the MECHANISM rather than the presence of a call: `root: false` still calls `startActiveSpan`, so a reader keyed on the OPENER NAME alone reads this tree as healthy. Only the `root: true` test discriminates — a parented span dispatched from inside the request it outlives is dropped as a late orphan, which is precisely the failure the family exists to catch",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        [TRACING_MODULE]:
          "export function withRequestSpan(id: string, name: string, attrs: A, fn: () => Promise<void>): Promise<void> {\n" +
          "  return t.startActiveSpan(name, { attributes: attrs, root: true }, fn);\n}\n",
      },
      why: "the healthy tree: one exported function opening a detached root, so the vocabulary is non-empty and the tripwire is silent",
    },
    {
      mode: "types",
      files: {
        [TRACING_MODULE]:
          "export function withRequestSpan(id: string, name: string, attrs: A, fn: () => Promise<void>): Promise<void> {\n" +
          "  return t.startActiveSpan(name, { attributes: attrs, root: true }, fn);\n}\n",
        "packages/server/src/domain/chat/verbs/turn.ts": "export function fire(ctx: C): void {\n  void ctx.rpg.onUserCommit(a, b).catch(() => undefined);\n}\n",
      },
      why: "THE SPLIT FENCE, and the only row that dies without it: an untraced dispatch beside a healthy derivation is the SIBLING policy's finding, never this one. Fold the occurrence arms back into this module and this row reds — which is the behaviour change the authority split exists to make impossible (a `hard` arm cannot be waived, and an occurrence finding must be)",
    },
  ],
});

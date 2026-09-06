// Policy: no-raw-matchmedia (UI-Gates-and-Lessons.md §11) — media-query plumbing lives in named one-homes.
// `usePrefersReducedMotion()` (render, live-updating) and `prefersReducedMotionNow()` (imperative) own the
// reduced-motion query; the shell's `use-is-mobile-viewport.ts` owns the viewport query. A feature that
// forks its own `matchMedia` grows a second, unsynchronised source of the same fact.
//
// AUTHORITY IS reviewed-grant. Every exception this rule has ever had is a recurring repository PERMISSION
// naming a specific file — the two reduced-motion homes and the shell viewport hook were `scanRoot`
// exclusions, and the media-grid's pointer-capability read carried a permanent `@orb-gate-ignore` whose
// stated reason ("no coarse-pointer home exists") is a standing state of the tree, not a per-occurrence
// slip. All four are now exact `(subject, operation)` rows in `lib/reviewed-grants.ts` with `why` and
// `endsWhen`; the marker is DELETED from `media-grid.tsx` in the same change, because a reviewed-grant policy
// has no inline door and a marker that suppresses nothing is the shape the central table exists to replace.
// A home that moves now reds at its row instead of carrying its exemption into the void.
//
// IDENTITY, NOT SPELLING. The legacy check was a PropertyAccess callee named `matchMedia`, so a bare
// `matchMedia(q)`, a computed `globalThis["matchMedia"](q)` and a stored alias were all invisible, while a
// same-named method on any project object red. The subject is the AMBIENT GLOBAL, resolved through
// `resolveGlobalMemberOrigin`.
//
// DECLARED NARROWING (its own mustPass row): a bare `typeof x.matchMedia` CAPABILITY PROBE is not plumbing —
// it reads whether the environment has the api at all, which every one-home does before using it.
//
// DECLARED LIMIT (its own mustPass row): `Reflect.get(globalThis, "matchMedia")` names the api in a STRING
// ARGUMENT rather than in a member read, so there is no member node to judge; closing it needs a reflective
// access fact no shared reader supplies today.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { classifyOriginRefusal } from "../lib/origin-verdict.ts";
import { readsAmbientGlobalPath } from "../lib/project-home-origin.ts";
import { resolveGlobalMemberOrigin, resolveModuleMemberOrigin } from "../lib/reference-fact.ts";
import type { ReviewedGrantCandidate } from "../lib/reviewed-grant-findings.ts";
import { reportReviewedGrantCandidates } from "../lib/reviewed-grant-findings.ts";

const MATCH_MEDIA = "matchMedia";
const OPERATION = "raw-match-media";

const MESSAGE =
  "a raw `matchMedia` read outside the named media-query one-homes — use `usePrefersReducedMotion()` " +
  "(render, live-updating), `prefersReducedMotionNow()` or `coarsePointerNow()` (imperative, #1182) from " +
  "`@orb/ui`'s `#lib`, or the shell's viewport hook, instead of forking matchMedia plumbing. See UI-Gates-and-Lessons.md §11.";
const UNREADABLE =
  "this reference is spelled like the ambient `matchMedia` but the shared readers cannot place its binding, so whether it is the browser api CANNOT be established. Reported rather than passed: the spelling alone is not the identity.";
const FIX =
  "read the fact through its one-home hook (usePrefersReducedMotion / prefersReducedMotionNow / coarsePointerNow / the shell viewport hook); a NEW media query needs a new one-home plus an exact reviewed grant, never a local read.";

/** Could this reference name the global at all? A bare `matchMedia`, or any member read whose leaf is
 *  `matchMedia` (`globalThis.matchMedia`, `window["matchMedia"]`). */
function matchMediaCandidate(node: MorphNode): boolean {
  if (Node.isIdentifier(node)) {
    return node.getText() === MATCH_MEDIA;
  }
  if (Node.isPropertyAccessExpression(node)) {
    return node.getName() === MATCH_MEDIA;
  }
  if (!Node.isElementAccessExpression(node)) {
    return false;
  }
  const argument = node.getArgumentExpression();
  return (
    argument !== undefined && (Node.isStringLiteral(argument) || Node.isNoSubstitutionTemplateLiteral(argument)) && argument.getLiteralText() === MATCH_MEDIA
  );
}

/** The DECLARED NARROWING: `typeof globals.matchMedia === "function"` is a capability probe, not a read of
 *  the api. Every one-home performs it before using the api, and a probe alone cannot fork the fact. */
function isCapabilityProbe(node: MorphNode): boolean {
  return Node.isTypeOfExpression(node.getParent());
}

/** An identifier that merely NAMES the member in a property position (`{ matchMedia }` in a type literal, a
 *  member declaration) is not a reference to the global. Only expression positions are read. */
function isExpressionReference(node: MorphNode): boolean {
  const parent = node.getParent();
  const named = Node.isPropertyAccessExpression(parent) && parent.getNameNode() === node;
  return !(named || Node.isPropertySignature(parent) || Node.isPropertyAssignment(parent) || Node.isMethodSignature(parent));
}

type MediaVerdict = "global" | "other" | "unreadable";

/** The global objects a browser api hangs off. */
const GLOBAL_RECEIVERS: ReadonlySet<string> = new Set(["globalThis", "self", "window"]);

function classify(node: MorphNode): MediaVerdict {
  // THE CAST AXIS, asked of the RECEIVER (shared with `no-raw-intl-time` through the same reader): the two
  // reduced-motion homes read the api as `(globalThis as { matchMedia?: … }).matchMedia`, and a cast gives
  // the property symbol a declaration in the CAST'S OWN type literal — a proven non-module binding, which
  // the shared refusal classifier correctly calls "a different identity". Judging the member alone PASSED
  // that spelling, so any feature could have left this law by casting `globalThis`. Whatever the property is
  // annotated as, the object it is read off cannot be cast away.
  //
  // PRECISE ONLY WHERE THE ROOT RESOLVES, which on this tree means `globalThis` — it is declared in the base
  // lib, while `window`/`self` and a bare `matchMedia` are DOM-lib declarations the analysis program does not
  // load. Those spellings fall through to the fail-closed UNREADABLE finding below: still reported, never
  // silently passed, and each carries its own proof row.
  if (readsAmbientGlobalPath(node, GLOBAL_RECEIVERS, [MATCH_MEDIA])) {
    return "global";
  }
  const global = resolveGlobalMemberOrigin(node);
  if (global.kind === "resolved") {
    return global.value.globalName === MATCH_MEDIA && global.value.memberPath.length === 0 ? "global" : "other";
  }
  // An IMPORTED `matchMedia` (a polyfill, a project wrapper) is a proven different identity: this law is
  // about forking the browser api, and importing a one-home's reader is the sanctioned shape.
  if (resolveModuleMemberOrigin(node).kind === "resolved") {
    return "other";
  }
  return classifyOriginRefusal(global.reason, node);
}

export const gate = defineGate({
  id: "no-raw-matchmedia",
  family: "no-raw-matchmedia",
  authority: "reviewed-grant",
  severity: "error",
  // The legacy predicate admitted client and ui sources and subtracted the three home files; the homes are
  // grants now, so nothing is subtracted. `entire-population` because grant liveness is a whole-population
  // verdict.
  population: ["@client", "@ui"],
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const candidates: ReviewedGrantCandidate[] = [];
    return {
      visitors: [
        {
          kinds: [SyntaxKind.Identifier, SyntaxKind.PropertyAccessExpression, SyntaxKind.ElementAccessExpression],
          visit: (node, sourceFile): void => {
            if (!matchMediaCandidate(node) || isCapabilityProbe(node) || !isExpressionReference(node)) {
              return;
            }
            const verdict = classify(node);
            if (verdict === "other") {
              return;
            }
            candidates.push({
              node,
              subject: ctx.relativePath(sourceFile),
              operation: OPERATION,
              unreadable: verdict === "unreadable",
              token: MATCH_MEDIA,
              offset: Math.max(node.getText().lastIndexOf(MATCH_MEDIA), 0),
            });
          },
        },
      ],
      evaluate: (): void => {
        reportReviewedGrantCandidates(ctx.report, candidates, { message: MESSAGE, fix: FIX, unreadableMessage: UNREADABLE });
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/client/src/features/x/x.tsx": 'export const G = (): unknown => globalThis.matchMedia("(prefers-reduced-motion: reduce)");\n',
      },
      expect: { count: 1, token: MATCH_MEDIA },
      why: "the founding shape — a feature forking its own media query instead of reading the one-home",
    },
    {
      mode: "types",
      files: {
        "packages/ui/src/lib/use-prefers-reduced-motion.ts": 'export const query = globalThis.matchMedia("(prefers-reduced-motion: reduce)");\n',
      },
      expect: { count: 1 },
      why: "THE PERMISSION IS NOT A CARVE-OUT IN THE RULE: the reduced-motion one-home reds like any other file and is licensed by an exact grant row, so a SECOND home is a finding until someone reviews it",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/x/x.tsx": 'export const G = (): unknown => globalThis["matchMedia"]("(pointer: fine)");\n',
      },
      expect: { count: 1 },
      why: "the COMPUTED-LITERAL member spelling of the same global (#1506) — invisible to the legacy PropertyAccess-only check",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/x/x.tsx": 'const probe = globalThis.matchMedia;\nexport const G = (): unknown => probe("(pointer: coarse)");\n',
      },
      expect: { count: 1 },
      why: "A STORED ALIAS of the global is the same fork one binding away; the DECLARATION is the read the policy sees, and the aliased call site collapses into the same `(subject, operation)` finding",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/x/cast.ts":
          'const globals = globalThis as { matchMedia?: (query: string) => { matches: boolean } };\nexport const G = (): boolean => globals.matchMedia?.("(pointer: coarse)").matches === true;\n',
      },
      expect: { count: 1 },
      why: "THE CAST DODGE, measured on the real tree and closed here (shared with `no-raw-intl-time` through the same reader): a structural cast of `globalThis` gives the property symbol a declaration in the CAST'S OWN type literal, which the shared refusal classifier reads as a proven different identity — so judging the member alone PASSED this spelling, and any feature could have left the law that way. The RECEIVER's identity cannot be cast away, and that is what the verdict asks",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/x/bare.ts": 'export const G = (): unknown => matchMedia("(pointer: coarse)");\n',
      },
      expect: { count: 1 },
      why: "THE ROOT-SPELLING MATRIX, and the honest limit: `window.matchMedia` / `self.matchMedia` / a bare `matchMedia(q)` are the SAME api, but `window` and `self` are DOM-lib declarations the analysis program does not load, so the receiver rule cannot name them and they land on the FAIL-CLOSED unreadable finding instead. Reported either way — which is what this row pins — but only the `globalThis` root gets the precise message",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/x/window.ts": 'export const G = (): unknown => window.matchMedia("(prefers-reduced-motion: reduce)");\n',
      },
      expect: { count: 1 },
      why: "the second spelling of that matrix, pinned separately so a future DOM-aware program (or a precise `window` reader) shows up here as a message change rather than as a silent one",
    },
    {
      mode: "types",
      files: {
        "packages/ui/src/primitives/media-grid/media-grid.tsx": 'export const fine = (): boolean => globalThis.matchMedia("(pointer: fine)").matches;\n',
      },
      expect: { count: 1 },
      why: "THE TRANSLATED MARKER: the pointer-capability read carried a permanent `@orb-gate-ignore` because no coarse-pointer one-home exists. Under reviewed-grant authority there is no inline door, so the standing permission is an exact row with an `endsWhen` naming the missing home — and it reds here so the row is what licenses it",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/client/src/features/x/x.tsx":
          'import { usePrefersReducedMotion } from "../../../../ui/src/lib/use-prefers-reduced-motion.ts";\nexport const G = (): unknown => usePrefersReducedMotion();\n',
        "packages/ui/src/lib/use-prefers-reduced-motion.ts": "export declare function usePrefersReducedMotion(): boolean;\n",
      },
      why: "the fix: the feature reads the fact through the one-home hook and never touches the api",
    },
    {
      mode: "types",
      files: {
        "packages/ui/src/lib/reduced-motion-now.ts":
          'export function now(globals: { matchMedia?: (q: string) => { matches: boolean } }): boolean {\n  return typeof globals.matchMedia === "function";\n}\n',
      },
      why: "THE DECLARED NARROWING: a bare `typeof` CAPABILITY PROBE is not a read of the api — every one-home performs it before using the api, and a probe alone forks no fact",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/x/local.ts":
          "class Viewport {\n  matchMedia(query: string): boolean {\n    return query.length > 0;\n  }\n  run(): boolean {\n    return this.matchMedia('x');\n  }\n}\nexport const v = new Viewport();\n",
      },
      why: "SAME NAME, LOCAL METHOD: a project class with a `matchMedia` method is a proven different binding (case (a) of the refusal classifier) — the legacy name-only check red it",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/x/param.ts":
          'export function read(matchMedia: (q: string) => { matches: boolean }): boolean {\n  return matchMedia("(pointer: fine)").matches;\n}\n',
      },
      why: "A PARAMETER named `matchMedia` shadows the global — an injected reader is the testable shape, not a fork",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/x/reflect.ts":
          'export const G = (): unknown => (Reflect.get(globalThis, "matchMedia") as (query: string) => unknown)("(pointer: coarse)");\n',
      },
      why: 'THE DECLARED LIMIT of the reflective escape: `Reflect.get(globalThis, "matchMedia")` names the api in a STRING ARGUMENT, not in a member read, so there is no member node for this policy\'s subject to be. Catching it needs a reflective-access fact no shared reader supplies today; written down rather than left as a silent hole',
    },
  ],
});

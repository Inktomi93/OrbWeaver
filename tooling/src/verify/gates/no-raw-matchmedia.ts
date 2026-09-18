// Policy: no-raw-matchmedia (UI-Gates-and-Lessons.md §11) — media-query plumbing lives in named one-homes.
// `usePrefersReducedMotion()` (render, live-updating) and `prefersReducedMotionNow()` (imperative) own the
// reduced-motion query; the shell's `use-is-mobile-viewport.ts` owns the viewport query. A feature that
// forks its own `matchMedia` grows a second, unsynchronised source of the same fact.
//
// AUTHORITY IS reviewed-grant. Every exception this rule has ever had is a recurring repository PERMISSION
// naming a specific file — the two reduced-motion homes, the shell viewport hook and the imperative
// coarse-pointer home (`coarsePointerNow()`, #1182) are each a standing one-home reader, and the media-grid's
// pointer-capability read carried a permanent `@orb-gate-ignore` whose stated reason ("no coarse-pointer home
// exists") is now FALSE — the home exists — but the read it guards is `(pointer: fine)`, a DIFFERENT query
// the coarse-pointer home does not answer, so the grant survives with its `why` naming that mismatch instead.
// All FIVE are exact `(subject, operation)` rows in `lib/reviewed-grants.ts` with `why` and `endsWhen`; the
// marker was DELETED from `media-grid.tsx` when its row was minted, because a reviewed-grant policy has no
// inline door and a marker that suppresses nothing is the shape the central table exists to replace.
// A home that moves now reds at its row instead of carrying its exemption into the void.
//
// THE ONE-HOMES ARE SCANNED AND LICENSED, NEVER SCOPED OUT — read this before copying the message. The
// `message` opens "a raw `matchMedia` read OUTSIDE the named media-query one-homes", and the policy REPORTS
// INSIDE them: each home reds like any other file and a grant row consumes the finding before any human
// sees it (`mustFlag[1]` is exactly that row). So the clause is true of the EFFECTIVE finding set — which
// is the only set a reader ever gets — and false of the raw scan, and that is deliberate (owner ruling
// 2026-09-11, #2005: a reviewed-grant policy's message states its VERDICT, not its internals). The risk
// §5b.2 guards here is not the wording: it is a copying lane reading "outside the one-homes" as
// SCOPE-EXCLUDED and writing a population subtraction. Do not. A subtracted home is invisible when it moves;
// a granted home reds at its row. (The legacy descriptor DID subtract — see the population port below.)
//
// IDENTITY, NOT SPELLING. The legacy check was a PropertyAccess callee named `matchMedia`, so a bare
// `matchMedia(q)`, a computed `globalThis["matchMedia"](q)` and a stored alias were all invisible, while a
// same-named method on any project object red. The subject is the AMBIENT GLOBAL, resolved through
// `resolveGlobalMemberOrigin`.
//
// FAMILY: a declared SINGLETON (`family` equals the id). The identity work is entirely borrowed — the cast
// axis is `lib/project-home-origin.ts` `readsAmbientGlobalPath` (shared with `no-raw-intl-time`), the origin
// readers are `_shared/reference-fact.ts` `resolveGlobalMemberOrigin`/`resolveModuleMemberOrigin`, the two-answer
// refusal is `lib/origin-verdict.ts` `classifyOriginRefusal`, and the dedupe is
// `lib/reviewed-grant-findings.ts` — so there is no gate-owned reader to share and no sibling arm to split
// off. One api, one law, one population; a family string would only name itself.
//
// DECLARED NARROWING (its own mustPass row): a bare `typeof x.matchMedia` CAPABILITY PROBE is not plumbing —
// it reads whether the environment has the api at all, which every one-home does before using it.
//
// DECLARED LIMIT (its own mustPass row): `Reflect.get(globalThis, "matchMedia")` names the api in a STRING
// ARGUMENT rather than in a member read, so there is no member node to judge; closing it needs a reflective
// access fact no shared reader supplies today.
//
// NARROWING CENSUS (§4.1, measured by cutting each fence and running every row, 2026-09-11). Each narrowing
// names the row that DIES without it: the name prefilter -> `mustFlag[3]`; `readsAmbientGlobalPath` (the cast
// axis) -> `mustFlag[4]`; the `"other"` early return -> `mustPass[2]`/`mustPass[3]`; `isCapabilityProbe` ->
// `mustPass[1]`; `isExpressionReference` -> `mustPass[4]`; the imported-origin arm -> `mustPass[5]`; the
// `population` fence -> `mustPass[6]`; the fail-closed refusal -> `mustFlag[8]`. `mustPass[1]` dies under the
// `isExpressionReference` cut too (the probe's member NAME becomes its own candidate), so `mustPass[4]` is the
// row that isolates that fence.
// ONE narrowing has no row and CANNOT have one: `memberPath.length === 0` in `classify`. The only expression
// that reaches the shared reader with `globalName === "matchMedia"` and a NON-empty member path is a read off
// an already-flagging read (`globalThis.matchMedia["matchMedia"]`), and reviewed-grant findings dedupe by
// `(subject, operation)` — so the inner occurrence produces the same single finding whether the clause is
// there or not (measured: one PRECISE finding both ways). The clause stays because it is the shared reader's
// own contract — `globalName` names the api only when nothing was read off it — but it is enforced by no
// fixture, and saying so is cheaper than a row that pretends.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { resolveGlobalMemberOrigin, resolveModuleMemberOrigin } from "../../_shared/reference-fact.ts";
import { defineGate } from "../contract/policy.ts";
import { classifyOriginRefusal } from "../lib/origin-verdict.ts";
import { readsAmbientGlobalPath } from "../lib/project-home-origin.ts";
import type { ReviewedGrantCandidate } from "../lib/reviewed-grant-findings.ts";
import { reportReviewedGrantCandidates } from "../lib/reviewed-grant-findings.ts";

const MATCH_MEDIA = "matchMedia";
const OPERATION = "raw-match-media";

const MESSAGE =
  "a raw `matchMedia` read outside the named media-query one-homes — use `usePrefersReducedMotion()` " +
  "(render, live-updating), `prefersReducedMotionNow()` or `coarsePointerNow()` (imperative, #1182) from " +
  "`@orb/ui`'s `#lib`, or the shell's viewport hook, instead of forking matchMedia plumbing. See UI-Gates-and-Lessons.md §11.";
const UNREADABLE =
  "this reference is spelled like the ambient `matchMedia` but the shared readers cannot place its binding, so whether it is the browser api CANNOT be established. Reported rather than passed: the spelling alone is not the identity. Give the binding a readable import origin; the three-answer rule is tooling/src/verify/lib/origin-verdict.ts (#944).";
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
  // WHICH ROOTS RESOLVE IS A PROPERTY OF THE ANALYSIS PROGRAM'S `lib`, and this module used to state the
  // wrong one. It claimed `window`/`self`/a bare `matchMedia(q)` were DOM-lib declarations the program does
  // not load and therefore landed on the fail-closed UNREADABLE finding. MEASURED 2026-09-11 and FALSE in
  // both runtimes: the live structure pass builds `new Project({ skipAddingFilesFromTsConfig: true })`
  // (`lib/pass.ts` `projectCtx` -> `_shared/ts-workspace.ts` `getWorkspace`) and the conformance runtime
  // builds its virtual project the same way (`ops/policy-conformance.ts`), so both run under ts-morph's
  // DEFAULT compiler options — hence the DEFAULT lib, which INCLUDES DOM. All four root spellings resolve
  // through `resolveGlobalMemberOrigin` and carry the PRECISE message; `mustFlag[5]`/`mustFlag[6]` now pin
  // that text with `messageIncludes`, which is what makes a change show up there instead of silently.
  // The fail-closed UNREADABLE finding below is NOT reached by a root spelling. It is reached by a reference
  // whose binding no shared reader can place at all — a member of an OPAQUE receiver (`mustFlag[8]`), and any
  // ambiguous `write`/`cycle` binding. A DOM-LESS program would additionally move the three root spellings
  // onto it rather than into silence; that is a `lib` a proof row cannot choose, so it is pinned in
  // `tests/tooling/verify/gates/home-client-family.suite.test.ts` beside the refusal control.
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
  // POPULATION PORT: an INTENTIONAL CORRECTION, legacy at 6a7978135 (the parent of 256682e4a). The legacy
  // `scanRoot` was `p.includes("packages/client/src/") || p.includes("packages/ui/src/")` MINUS three home
  // files returned false one at a time (`use-prefers-reduced-motion.ts`, `reduced-motion-now.ts`,
  // `use-is-mobile-viewport.ts`). The final admits the same two packages and subtracts NOTHING — the homes
  // are grant rows now, which is the whole point (see the header). `entire-population` because grant
  // liveness is a whole-population verdict.
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
      grant: { subject: "packages/client/src/features/x/x.tsx", operation: "raw-match-media" },
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
      expect: { count: 1, token: MATCH_MEDIA },
      why: "THE PERMISSION IS NOT A CARVE-OUT IN THE RULE: the reduced-motion one-home reds like any other file and is licensed by an exact grant row, so a SECOND home is a finding until someone reviews it",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/x/x.tsx": 'export const G = (): unknown => globalThis["matchMedia"]("(pointer: fine)");\n',
      },
      expect: { count: 1, token: MATCH_MEDIA },
      why: "the COMPUTED-LITERAL member spelling of the same global (#1506) — invisible to the legacy PropertyAccess-only check",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/x/x.tsx": 'const probe = globalThis.matchMedia;\nexport const G = (): unknown => probe("(pointer: coarse)");\n',
      },
      expect: { count: 1, token: MATCH_MEDIA },
      why: "A STORED ALIAS of the global is the same fork one binding away; the DECLARATION is the read the policy sees, and the aliased call site collapses into the same `(subject, operation)` finding",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/x/cast.ts":
          'const globals = globalThis as { matchMedia?: (query: string) => { matches: boolean } };\nexport const G = (): boolean => globals.matchMedia?.("(pointer: coarse)").matches === true;\n',
      },
      expect: { count: 1, token: MATCH_MEDIA },
      why: "THE CAST DODGE, measured on the real tree and closed here (shared with `no-raw-intl-time` through the same reader): a structural cast of `globalThis` gives the property symbol a declaration in the CAST'S OWN type literal, which the shared refusal classifier reads as a proven different identity — so judging the member alone PASSED this spelling, and any feature could have left the law that way. The RECEIVER's identity cannot be cast away, and that is what the verdict asks",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/x/bare.ts": 'export const G = (): unknown => matchMedia("(pointer: coarse)");\n',
      },
      expect: { count: 1, messageIncludes: "outside the named media-query one-homes" },
      why: "THE ROOT-SPELLING MATRIX: `window.matchMedia` / `self.matchMedia` / a bare `matchMedia(q)` are the SAME api as the `globalThis` root, and MEASURED 2026-09-11 they get the SAME precise message — the analysis program (live pass and conformance alike) runs under ts-morph's default compiler options, whose default lib includes DOM, so all four roots resolve. The `messageIncludes` is the pin: a lib change, a DOM-aware program or a precise `window` reader moves this row's message to the fail-closed text and reds HERE rather than passing silently. This row's claim was wrong until #1584's exemplar audit; the header records the measurement",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/x/window.ts": 'export const G = (): unknown => window.matchMedia("(prefers-reduced-motion: reduce)");\n',
      },
      expect: { count: 1, messageIncludes: "outside the named media-query one-homes" },
      why: "the second spelling of that matrix, pinned separately WITH the message it actually gets, so a future program change shows up here as a message change rather than as a silent one — which the row promised while carrying no message pin at all, and could not deliver",
    },
    {
      mode: "types",
      files: {
        "packages/ui/src/primitives/media-grid/media-grid.tsx": 'export const fine = (): boolean => globalThis.matchMedia("(pointer: fine)").matches;\n',
      },
      expect: { count: 1, token: MATCH_MEDIA },
      why: "THE TRANSLATED MARKER: the pointer-capability read carried a permanent `@orb-gate-ignore` because no coarse-pointer one-home exists. Under reviewed-grant authority there is no inline door, so the standing permission is an exact row with an `endsWhen` naming the missing home — and it reds here so the row is what licenses it",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/x/opaque.ts": 'declare const host: any;\nexport const G = (): unknown => host.matchMedia("(pointer: coarse)");\n',
      },
      expect: { count: 1, messageIncludes: "CANNOT be established" },
      why: "THE FAIL-CLOSED ARM ITSELF, which no row exercised until #1584's exemplar audit: a member read off an OPAQUE receiver is case (b) of the shared refusal classifier — no shared reader can place the binding, so the spelling MIGHT be the browser api and is REPORTED with the unreadable message rather than passed. The `messageIncludes` is what separates the two arms (it is the only other message this policy emits), and the row dies outright if `classifyOriginRefusal` is ever made to fail OPEN",
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
        "packages/ui/src/lib/reduced-motion-now.ts": 'export function has(): boolean {\n  return typeof globalThis.matchMedia === "function";\n}\n',
      },
      why: "THE DECLARED NARROWING: a bare `typeof` CAPABILITY PROBE is not a read of the api — every one-home performs it before using the api, and a probe alone forks no fact. The subject is the `globalThis` root DELIBERATELY, so the probe fence is the ONLY thing keeping this row green: it flags the moment `isCapabilityProbe` is cut. The row used to read the api off a PARAMETER, which `mustPass[3]` already covers — two fences protected one fixture and the row credited the wrong one (#1584 exemplar audit)",
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
        "packages/client/src/features/x/host.ts":
          'declare const host: Window;\nexport const G = (): boolean => host.matchMedia("(pointer: coarse)").matches;\n',
      },
      why: "THE EXPRESSION-POSITION NARROWING: an INJECTED `Window` is read like a parameter, and the only `matchMedia` identifier in the file sits in a member NAME position — a name is not a reference to the global, so the policy judges the member READ (whose receiver is a local binding, a different identity) and not the name. The name's own symbol is the DOM lib's ambient `Window.matchMedia`, so the moment `isExpressionReference` is cut this file flags: the row dies without the narrowing it is named after",
    },
    {
      mode: "types",
      files: {
        "packages/ui/src/lib/media-query-shim.ts": "export declare function matchMedia(query: string): { matches: boolean };\n",
        "packages/client/src/features/x/imported.ts":
          'import { matchMedia } from "../../../../ui/src/lib/media-query-shim.ts";\nexport const G = (): boolean => matchMedia("(pointer: coarse)").matches;\n',
      },
      why: "THE IMPORTED-ORIGIN ARM: an imported `matchMedia` is a proven DIFFERENT identity (a project shim, a polyfill, a one-home's reader), which is the sanctioned shape this law points people at. Cut the `resolveModuleMemberOrigin` arm and the same file lands on the fail-closed unreadable finding instead, so this row is what holds the arm — nothing did before #1584's exemplar audit",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/x/ok.ts":
          'import { usePrefersReducedMotion } from "../../../../ui/src/lib/use-prefers-reduced-motion.ts";\nexport const G = (): unknown => usePrefersReducedMotion();\n',
        "packages/ui/src/lib/use-prefers-reduced-motion.ts": "export declare function usePrefersReducedMotion(): boolean;\n",
        "packages/server/src/domain/x/render.ts": 'export const G = (): unknown => globalThis.matchMedia("(prefers-reduced-motion: reduce)");\n',
      },
      why: "THE POPULATION FENCE: the identical founding violation in a SERVER file is not this policy's business — media-query plumbing is a browser concern and the population is `@client`/`@ui`. The two in-population files are what keeps the example from being an empty population; add `@server` to the fence and the server file flags, so this row is the fence's proof",
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

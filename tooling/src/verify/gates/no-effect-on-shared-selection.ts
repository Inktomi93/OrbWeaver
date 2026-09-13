// Policy: no-effect-on-shared-selection (UI-Architecture-and-Layout.md §5.1) — §5.1 sanctions three
// render-only reader shapes for the shared selection stores; what it bans is subscribe-and-EFFECT. A
// `useEffect`/`useLayoutEffect`/`useInsertionEffect` in `features/**` keyed on a value TAINTED by a
// shared-selection pointer is a surface reacting to ambient selection with side effects — the neo
// `this_chid` chase reborn. Derive in render, or use `useEffectEvent` for a non-reactive read.
//
// AUTHORITY IS reviewed-grant, WITH NO ROW TODAY. `features/app-shell/` OWNS the shared-selection pointers
// (routing, panels and modal state are the shell's own lifecycle), which is why the legacy module carried it
// as a `SANCTIONED_HOMES` directory row — but on this tree the shell chases NOTHING: the whole population
// produces zero findings, so a grant row for it would be consumed zero times and is STALE by contract. An
// unexercised permission is not representable and must not be invented; the shell is SCANNED and clean.
// What survives is the AUTHORITY: the day the shell (or anything else) needs to react to selection with an
// effect, it reds and the decision is a REVIEWED row in `lib/reviewed-grants.ts` with a `why` and an
// `endsWhen`, never an inline marker one author writes. That is strictly stronger than the directory
// exclusion, which carried its exemption silently through a rename of exactly the kind of feature directory
// that gets restructured.
//
// IDENTITY, NOT SPELLING, on both halves. The pointer vocabulary was a `SELECTION_HOOK_RE` REGEX kept in
// sync with `state/index.ts` "by a fixture", and the effect vocabulary was a second regex. The pointers are
// now the named exports RESOLVED to a declaration under `packages/client/src/state/`, so a feature-local
// helper of the same name is not one; the effects are React's own exports through the shared React-origin
// matcher. The vocabulary's own liveness is a RECEIPT against the state barrel: a renamed pointer leaves the
// receipt unresolved and REFUSES the run, where the legacy regex silently stopped matching. That check
// immediately paid for itself — three of the ten regex names (`useActiveDraftSeed`, `useActiveSessionKey`,
// `useMobileSheet`) name nothing on this tree at all and are dropped here.
//
// THE POINTER AXIS IS FAIL-CLOSED, like every other axis in this family and like this module's own EFFECT
// axis. `classifyProjectDirectoryOrigin` answers three ways, and the pointer read is the ACCUSING direction —
// a `home` verdict is what makes a call a taint SOURCE — so a predicate of `=== "home"` drops an UNREADABLE
// pointer out of the taint set entirely and the effect keyed on it is never reported. That is the fail-open
// shape the three-answer classifier exists to prevent (`lib/origin-verdict.ts`, GATE-AUTHORING §5, #944), and
// it is the opposite of the ACQUITTING readers §4.6 warns not to "fix": here only a PROVEN verdict accuses.
// The predicate is therefore `!== "other"` — only a reference PROVEN to bind something else is silent — and
// the candidate it produces carries its own `unreadable` flag so the finding says which it was. Fail-closure
// is safe here for the reason `origin-verdict.ts` names: the candidate set is NAME-PREFILTERED against
// `POINTERS` before any identity is resolved, so an unreadable node is only ever accused of being the pointer
// it already spells. The two messages are DISJOINT TEXT, not one built from the other, because a proof row
// can only pin the arm it can discriminate by substring (§4.1).
//
// THE TAINT IS FILE-SCOPED AND NAME-LEVEL, exactly as the legacy fixpoint was: a name bound from a pointer
// call is tainted, and a name whose initializer references a tainted name is tainted. What changed is HOW it
// is computed — a policy owns no descendant traversal, so the identifiers, declarations and dep arrays all
// arrive from the shared walk and are joined by SOURCE RANGE, per file, in one pass.
//
// FAMILY `react-origin` — the shared reader is `lib/react-origin.ts` (canonical React export identity),
// consumed here as `createReactExportMatcher` for the EFFECT half of the vocabulary, so `useEffect` and its
// two siblings are React's own exports rather than the second regex they were. The pointer half is a
// different reader (`lib/project-home-origin.ts`) on purpose: the two axes ask different questions and
// neither should be able to answer the other's.
// POPULATION PORT: an INTENTIONAL WIDENING BY EXACTLY TWO THINGS, both of which the paragraphs above state
// the reason for. The legacy `scanRoot: (p) => p.includes("packages/client/src/features/")` (`47fc0ae01^`)
// becomes `{ in: ["@client"], under: ["packages/client/src/features/**",
// "packages/client/src/state/index.ts"] }`. (1) `state/index.ts` joins the population as a RECEIPT carrier,
// never a subject: the pointer vocabulary resolves against the state barrel, so a renamed pointer REFUSES
// the run where the legacy regex silently stopped matching — which is how three dead names were found. (2)
// The `SANCTIONED_HOMES` row for `features/app-shell/` is DELETED rather than translated: the shell is
// scanned, produces zero findings, and its permission moved to reviewed-grant authority with no row today.
// The `includes(` → `under:` change is an ANCHORING, not a set change: 1006 tracked paths contain
// `packages/client/src/features/` and the same 1006 begin with it, so the two spellings select the same
// files on this tree.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `no-effect-on-shared-selection` descriptor at 256682e4aa17a2555c99834c468905fa53ae5500, the parent of the
// conversion `47fc0ae01` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over
// the SAME 7,224 harness candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy
// `scanRoot` admits 1,000 and final `population` admits 1,001. legacy − final = ∅. final − legacy =
// {`packages/client/src/state/index.ts`} — the receipt carrier the paragraph above records. Controls: inside
// `packages/client/src/features/app-shell/anchors/__cbbhr_in_region-anchor.tsx` (virtual) admitted by both; outside
// `packages/client/src/agent-handles/__cbbhr_out_index.ts` (virtual) rejected by both.
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { classifyProjectDirectoryOrigin, locateProjectHome } from "../lib/project-home-origin.ts";
import { createReactExportMatcher } from "../lib/react-origin.ts";
import type { ReviewedGrantCandidate } from "../lib/reviewed-grant-findings.ts";
import { reportReviewedGrantCandidates } from "../lib/reviewed-grant-findings.ts";
import { REACT_TYPES_HOME, reactProofModule } from "./_proof/react.ts";

/** The shared-selection POINTER hooks: the state stores' read APIs, not the lifecycle/draft stores. */
const POINTERS: ReadonlySet<string> = new Set([
  "useActiveChatHandle",
  "useActiveChatId",
  "useActiveSection",
  "useSelectedCharacterId",
  "useOpenModal",
  "useContextTab",
  "usePanelOverride",
]);
const EFFECTS = ["useEffect", "useLayoutEffect", "useInsertionEffect"] as const;
const STATE_DIR = "/packages/client/src/state/";
const STATE_BARREL = "packages/client/src/state/index.ts";
const OPERATION = "effect-on-shared-selection";

const MESSAGE =
  "an effect keyed on a shared-selection pointer — the neo `this_chid` chase (UI-Architecture-and-Layout.md " +
  "§5.1: selection readers are RENDER-only). Derive in render instead, or use `useEffectEvent` for a " +
  "non-reactive read inside an unrelated effect; if this surface genuinely cannot be render-driven, that is " +
  "a §5.1 amendment conversation, not a workaround.";
/** The FAIL-CLOSED arm's own text. Deliberately shares no sentence with `MESSAGE`: when an unreadable
 *  message is built as `${MESSAGE} …` the base text is a substring of both and neither arm is pinnable by
 *  `messageIncludes` (§4.1). `CANNOT be established` appears here and nowhere else in this module. */
const UNREADABLE =
  "an effect keyed on a name bound by a call that SPELLS a shared-selection pointer but whose identity " +
  "CANNOT be established — nothing this run can read declares it, so the call MIGHT be the shared store and " +
  "the effect is reported rather than silently passed (GATE-AUTHORING §5, #944). Give the call a readable " +
  "origin — import the pointer from `packages/client/src/state/`, or type the receiver it is read off — and " +
  "re-run; a readable hook of the same name that is not a shared-selection pointer stays silent.";
const FIX = "derive in render, or read non-reactively with useEffectEvent; the shell's own selection lifecycle is licensed by an exact reviewed grant.";

/** The state barrel as the proofs need it: the pointer vocabulary must RESOLVE to a declaration under
 *  `state/`, and the receipt reads its exports, so every row carries the real door. */
const SELECTION_BARREL = [
  "export declare function useActiveChatHandle(): string;",
  "export declare function useActiveChatId(): string | null;",
  "export declare function useActiveSection(): string;",
  "export declare function useSelectedCharacterId(): string | null;",
  "export declare function useOpenModal(): string | null;",
  "export declare function useContextTab(): string;",
  "export declare function usePanelOverride(): string | null;",
  "export declare function useDraftStore(): { readonly text: string };",
  "",
].join("\n");

interface Span {
  readonly start: number;
  readonly end: number;
}

interface Identifier extends Span {
  readonly name: string;
}

interface Declaration {
  readonly name: Span;
  readonly initializer: Span | null;
}

interface Effect {
  readonly node: MorphNode;
  readonly deps: Span;
  /** The effect door's spelling at the site — the finding's position token, which must be real TEXT there. */
  readonly spelling: string;
}

interface FileBuffer {
  readonly path: string;
  readonly identifiers: Identifier[];
  readonly declarations: Declaration[];
  readonly effects: Effect[];
  readonly pointers: MorphNode[];
}

function span(node: MorphNode): Span {
  return { start: node.getStart(), end: node.getEnd() };
}

function namesIn(identifiers: readonly Identifier[], range: Span): readonly string[] {
  return identifiers.filter((identifier) => identifier.start >= range.start && identifier.end <= range.end).map((identifier) => identifier.name);
}

/** Seed taint: every name bound by a declaration whose initializer contains a resolved pointer call. */
function seedTaint(buffer: FileBuffer, pointerSpans: readonly Span[]): Set<string> {
  const tainted = new Set<string>();
  for (const declaration of buffer.declarations) {
    const initializer = declaration.initializer;
    if (initializer === null || !pointerSpans.some((call) => call.start >= initializer.start && call.end <= initializer.end)) {
      continue;
    }
    for (const name of namesIn(buffer.identifiers, declaration.name)) {
      tainted.add(name);
    }
  }
  return tainted;
}

/** One propagation pass over initializer references. Returns true when the taint set grew. */
function propagate(buffer: FileBuffer, tainted: Set<string>): boolean {
  let grew = false;
  for (const declaration of buffer.declarations) {
    const initializer = declaration.initializer;
    if (initializer === null || !namesIn(buffer.identifiers, initializer).some((name) => tainted.has(name))) {
      continue;
    }
    for (const name of namesIn(buffer.identifiers, declaration.name)) {
      if (!tainted.has(name)) {
        tainted.add(name);
        grew = true;
      }
    }
  }
  return grew;
}

/** The file's tainted names: pointer results, then a name-level fixpoint bounded by the declaration count. */
function taintedNames(buffer: FileBuffer, pointerSpans: readonly Span[]): ReadonlySet<string> {
  const tainted = seedTaint(buffer, pointerSpans);
  for (let pass = 0; pass < buffer.declarations.length && tainted.size > 0; pass += 1) {
    if (!propagate(buffer, tainted)) {
      break;
    }
  }
  return tainted;
}

export const gate = defineGate({
  id: "no-effect-on-shared-selection",
  family: "react-origin",
  authority: "reviewed-grant",
  severity: "error",
  // The legacy predicate was `features/**`; the app-shell home is NOT subtracted (it is a grant), and the
  // state BARREL joins the population because the pointer vocabulary's liveness receipt is read off it.
  // That one added path is this conversion's classified population delta.
  population: { in: ["@client"], under: ["packages/client/src/features/**", "packages/client/src/state/index.ts"] },
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const effectMatchers = EFFECTS.map((name) => ({ name, matcher: createReactExportMatcher(name) }));
    const candidates: ReviewedGrantCandidate[] = [];
    let buffer: FileBuffer | null = null;

    /** Judge and drop the buffered file. Buffering is per FILE because the taint is: the dispatcher walks one
     *  file at a time, so the previous buffer is complete the moment a node from the next file arrives. */
    const flush = (): void => {
      const current = buffer;
      buffer = null;
      if (current === null || current.effects.length === 0 || current.pointers.length === 0) {
        return;
      }
      const verdicts = current.pointers.map((callee) => ({ callee, verdict: classifyProjectDirectoryOrigin(callee, STATE_DIR, POINTERS) }));
      const provenSpans = verdicts.filter((read) => read.verdict === "home").map((read) => span(read.callee));
      const unreadableSpans = verdicts.filter((read) => read.verdict === "unreadable").map((read) => span(read.callee));
      if (provenSpans.length === 0 && unreadableSpans.length === 0) {
        return;
      }
      // Two fixpoints rather than one: propagation is monotone and per-seed independent, so running the
      // seeds separately is the same name set as one combined run PLUS the provenance the finding needs.
      // An effect reached by a PROVEN pointer takes the precise message even when an unreadable one also
      // taints it — the accusation is proven, and only a group whose every candidate is unreadable gets the
      // fail-closed text (`lib/reviewed-grant-findings.ts`).
      const proven = taintedNames(current, provenSpans);
      const unreadable = taintedNames(current, unreadableSpans);
      for (const effect of current.effects) {
        const deps = namesIn(current.identifiers, effect.deps);
        const provenHit = deps.some((name) => proven.has(name));
        if (!(provenHit || deps.some((name) => unreadable.has(name)))) {
          continue;
        }
        candidates.push({
          node: effect.node,
          subject: current.path,
          operation: OPERATION,
          unreadable: !provenHit,
          token: effect.spelling,
          offset: Math.max(effect.node.getText().indexOf(effect.spelling), 0),
        });
      }
    };

    const bufferFor = (sourceFile: SourceFile): FileBuffer => {
      const path = ctx.relativePath(sourceFile);
      if (buffer?.path !== path) {
        flush();
        buffer = { path, identifiers: [], declarations: [], effects: [], pointers: [] };
      }
      return buffer;
    };

    /** The callee's own name, for the two candidate prefilters. */
    const calleeName = (callee: MorphNode): string | null => {
      if (Node.isIdentifier(callee)) {
        return callee.getText();
      }
      return Node.isPropertyAccessExpression(callee) ? callee.getName() : null;
    };

    return {
      visitors: [
        {
          kinds: [SyntaxKind.Identifier],
          visit: (node, sourceFile): void => {
            bufferFor(sourceFile).identifiers.push({ name: node.getText(), ...span(node) });
          },
        },
        {
          kinds: [SyntaxKind.VariableDeclaration],
          visit: (node, sourceFile): void => {
            if (!Node.isVariableDeclaration(node)) {
              return;
            }
            const initializer = node.getInitializer();
            bufferFor(sourceFile).declarations.push({ name: span(node.getNameNode()), initializer: initializer === undefined ? null : span(initializer) });
          },
        },
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node, sourceFile): void => {
            if (!Node.isCallExpression(node)) {
              return;
            }
            const callee = node.getExpression();
            const name = calleeName(callee);
            if (name === null) {
              return;
            }
            const file = bufferFor(sourceFile);
            if (POINTERS.has(name)) {
              file.pointers.push(callee);
              return;
            }
            const effect = effectMatchers.find((candidate) => candidate.name === name);
            const deps = node.getArguments()[1];
            if (effect === undefined || deps === undefined || !Node.isArrayLiteralExpression(deps)) {
              return;
            }
            if (effect.matcher.reference(callee) !== "other") {
              file.effects.push({ node, deps: span(deps), spelling: name });
            }
          },
        },
      ],
      evaluate: (): void => {
        flush();
        const barrel = locateProjectHome(ctx.files, ctx.relativePath, { path: STATE_BARREL, names: [...POINTERS] });
        // The vocabulary's liveness, as a receipt: a pointer this policy is written against that the state
        // barrel no longer exports leaves the receipt UNRESOLVED and refuses the run. The legacy regex just
        // stopped matching — which is how three dead names survived in it.
        ctx.receipt({ kind: "population", source: "shared-selection pointers", members: barrel.members, unresolved: barrel.unresolved });
        reportReviewedGrantCandidates(ctx.report, candidates, { message: MESSAGE, fix: FIX, unreadableMessage: UNREADABLE });
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      grant: { subject: "packages/client/src/features/chat/hooks/x.ts", operation: "effect-on-shared-selection" },
      files: {
        [REACT_TYPES_HOME]: reactProofModule(),
        "packages/client/src/state/index.ts": SELECTION_BARREL,
        "packages/client/src/features/chat/hooks/x.ts":
          'import { useEffect } from "react";\nimport { useActiveChatId } from "../../../state/index.ts";\nexport function C(): void {\n  const chatId = useActiveChatId();\n  useEffect(() => {}, [chatId]);\n}\n',
      },
      expect: { count: 1 },
      why: "the founding shape — an effect keyed on a shared-selection pointer, the neo this_chid chase (§5.1)",
    },
    {
      mode: "types",
      files: {
        [REACT_TYPES_HOME]: reactProofModule(),
        "packages/client/src/state/index.ts": SELECTION_BARREL,
        "packages/client/src/features/chat/hooks/transitive.ts":
          'import { useEffect } from "react";\nimport { useActiveChatId } from "../../../state/index.ts";\nexport function C(): void {\n  const chatId = useActiveChatId();\n  const gated = chatId !== null;\n  useEffect(() => {}, [gated]);\n}\n',
      },
      expect: { count: 1 },
      why: "TRANSITIVE taint — `gated` derives from the tainted `chatId`, and the name-level fixpoint still chases (§5.1)",
    },
    {
      mode: "types",
      files: {
        [REACT_TYPES_HOME]: reactProofModule(),
        "packages/client/src/state/index.ts": SELECTION_BARREL,
        "packages/client/src/features/app-shell/shell.ts":
          'import { useEffect } from "react";\nimport { useActiveChatId } from "../../state/index.ts";\nexport function Shell(): void {\n  const chatId = useActiveChatId();\n  useEffect(() => {}, [chatId]);\n}\n',
      },
      expect: { count: 1 },
      why: "THE HOME IS NOT A CARVE-OUT IN THE RULE: the shell OWNS the pointers and still reds like any other feature. It holds NO grant row, because it chases nothing on this tree and a row consumed zero times is stale — this row proves what the shell would have to bring to review if that changed",
    },
    {
      mode: "types",
      files: {
        [REACT_TYPES_HOME]: reactProofModule(),
        "packages/client/src/state/index.ts": SELECTION_BARREL,
        "packages/client/src/features/chat/hooks/layout.ts":
          'import { useLayoutEffect } from "react";\nimport { useOpenModal } from "../../../state/index.ts";\nexport function C(): void {\n  const modal = useOpenModal();\n  useLayoutEffect(() => {}, [modal]);\n}\n',
      },
      expect: { count: 1 },
      why: "the other effect doors are the same law — `useLayoutEffect` and `useInsertionEffect` chase identically",
    },
    {
      mode: "types",
      files: {
        [REACT_TYPES_HOME]: reactProofModule(),
        "packages/client/src/state/index.ts": SELECTION_BARREL,
        "packages/client/src/features/chat/hooks/twice.ts":
          'import { useEffect } from "react";\nimport { useActiveChatId } from "../../../state/index.ts";\nexport function C(): void {\n  const chatId = useActiveChatId();\n  useEffect(() => {}, [chatId]);\n  useEffect(() => {}, [chatId]);\n}\n',
      },
      expect: { count: 1 },
      why: "GRANT GRANULARITY: two chasing effects in one file are ONE `(subject, operation)` finding, because a row matching both would be OVER-BROAD and would license neither",
    },
    {
      mode: "types",
      files: {
        [REACT_TYPES_HOME]: reactProofModule(),
        "packages/client/src/state/index.ts": SELECTION_BARREL,
        "packages/client/src/features/chat/hooks/opaque.ts":
          'import { useEffect } from "react";\ndeclare function opaque(): any;\nexport function C(): void {\n  const chatId = opaque().useActiveChatId();\n  useEffect(() => {}, [chatId]);\n}\n',
      },
      expect: { count: 1, messageIncludes: "CANNOT be established" },
      why: 'THE FAIL-CLOSED POINTER ARM (§4.1\'s reusable falsifier). An opaque `any` receiver gives the pointer read no symbol and no declaration, so `classifyProjectDirectoryOrigin` answers `unreadable`. Under the old `=== "home"` predicate the call dropped out of the taint set and this file passed SILENTLY; the row dies without the fail-closed predicate, and `messageIncludes` is what makes it die rather than pass on the precise message',
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        [REACT_TYPES_HOME]: reactProofModule(),
        "packages/client/src/state/index.ts": SELECTION_BARREL,
        "packages/client/src/features/chat/hooks/ok.ts":
          'import { useEffect } from "react";\nexport function C(props: { chatId: string }): void {\n  useEffect(() => {}, [props.chatId]);\n}\n',
      },
      why: "an effect depping a PROP (selection threaded by the route) is the composition shape §5.1 asks for",
    },
    {
      mode: "types",
      files: {
        [REACT_TYPES_HOME]: reactProofModule(),
        "packages/client/src/state/index.ts": SELECTION_BARREL,
        "packages/client/src/features/chat/hooks/no-deps.ts":
          'import { useEffect } from "react";\nimport { useActiveChatId } from "../../../state/index.ts";\nexport function C(): void {\n  const chatId = useActiveChatId();\n  useEffect(() => {\n    void chatId;\n  });\n}\n',
      },
      why: "an effect with NO dep array is exhaustive-deps' business, not this rule's — the legacy narrowing, kept",
    },
    {
      mode: "types",
      files: {
        [REACT_TYPES_HOME]: reactProofModule(),
        "packages/client/src/state/index.ts": SELECTION_BARREL,
        "packages/client/src/features/chat/hooks/local.ts":
          'import { useEffect } from "react";\nfunction useActiveChatId(): string {\n  return "x";\n}\nexport function C(): void {\n  const chatId = useActiveChatId();\n  useEffect(() => {}, [chatId]);\n}\n',
      },
      why: "THE COUNTERFACTUAL: a feature-LOCAL hook with a pointer's name reads no shared store — the legacy regex red exactly this, and only the resolved declaration home separates them",
    },
    {
      mode: "types",
      files: {
        [REACT_TYPES_HOME]: reactProofModule(),
        "packages/client/src/state/index.ts": SELECTION_BARREL,
        "packages/client/src/features/chat/hooks/lifecycle.ts":
          'import { useEffect } from "react";\nimport { useDraftStore } from "../../../state/index.ts";\nexport function C(): void {\n  const draft = useDraftStore();\n  useEffect(() => {}, [draft]);\n}\n',
      },
      why: "a LIFECYCLE store read (the draft/chat-stream family) is not a shared-selection pointer — §5.1 fences the pointers, and the vocabulary is exact",
    },
    {
      mode: "types",
      files: {
        [REACT_TYPES_HOME]: reactProofModule(),
        "packages/client/src/state/index.ts": SELECTION_BARREL,
        "packages/client/src/features/chat/hooks/same-name.ts": 'export function useActiveChatId(): string {\n  return "x";\n}\n',
        "packages/client/src/features/chat/hooks/imported.ts":
          'import { useEffect } from "react";\nimport { useActiveChatId } from "./same-name.ts";\nexport function C(): void {\n  const chatId = useActiveChatId();\n  useEffect(() => {}, [chatId]);\n}\n',
      },
      why: 'THE OTHER POLARITY, pinned so fail-closure cannot become accuse-everything: a pointer-named hook IMPORTED from a feature module resolves to a canonical declaration outside `state/` and is PROVEN other. It is the module-alias path, where `bindsProvenNonModuleDeclaration` answers false — so if the resolver ever stopped reading this shape the verdict would be `unreadable` and this row would RED, which is exactly the over-report the `!== "other"` predicate risks',
    },
  ],
});

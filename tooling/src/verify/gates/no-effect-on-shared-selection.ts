// Policy: no-effect-on-shared-selection (UI-Architecture-and-Layout.md §5.1) — §5.1 sanctions three
// render-only reader shapes for the shared selection stores; what it bans is subscribe-and-EFFECT. A
// `useEffect`/`useLayoutEffect`/`useInsertionEffect` in `features/**` keyed on a value TAINTED by a
// shared-selection pointer is a surface reacting to ambient selection with side effects — the neo
// `this_chid` chase reborn. Derive in render, or use `useEffectEvent` for a non-reactive read.
//
// AUTHORITY IS reviewed-grant: `features/app-shell/` OWNS the shared-selection pointers (routing, panels and
// modal state are the shell's own lifecycle), which is a recurring repository PERMISSION and therefore an
// exact `(subject, operation)` row in `lib/reviewed-grants.ts` — SCANNED, not subtracted from the corpus as
// the legacy `SANCTIONED_HOMES` directory row was. The row carries the rename liveness the old shape could
// not: "app-shell" is exactly the kind of feature directory that gets restructured.
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
// THE TAINT IS FILE-SCOPED AND NAME-LEVEL, exactly as the legacy fixpoint was: a name bound from a pointer
// call is tainted, and a name whose initializer references a tainted name is tainted. What changed is HOW it
// is computed — a policy owns no descendant traversal, so the identifiers, declarations and dep arrays all
// arrive from the shared walk and are joined by SOURCE RANGE, per file, in one pass.
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
      const pointerSpans = current.pointers
        .filter((callee) => classifyProjectDirectoryOrigin(callee, STATE_DIR, POINTERS) === "home")
        .map((callee) => span(callee));
      if (pointerSpans.length === 0) {
        return;
      }
      const tainted = taintedNames(current, pointerSpans);
      for (const effect of current.effects) {
        if (namesIn(current.identifiers, effect.deps).some((name) => tainted.has(name))) {
          candidates.push({
            node: effect.node,
            subject: current.path,
            operation: OPERATION,
            token: effect.spelling,
            offset: Math.max(effect.node.getText().indexOf(effect.spelling), 0),
          });
        }
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
        reportReviewedGrantCandidates(ctx.report, candidates, { message: MESSAGE, fix: FIX, unreadableMessage: MESSAGE });
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
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
      why: "THE PERMISSION IS NOT A CARVE-OUT IN THE RULE: the shell OWNS the pointers, reds like any other feature, and is licensed by an exact grant row — so a SECOND feature claiming the shell's lifecycle is a finding until someone reviews it",
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
  ],
});

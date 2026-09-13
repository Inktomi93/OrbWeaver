// Policy: render-error-via-battery (derive-modernization-audit.md §W4, G29 — the read-error battery sealed).
// `QueryBoundary`'s `renderError` renders the failed-read surface, and `QueryErrorState` IS that surface
// ("Couldn't load X." plus a real refetch Retry) — QueryBoundary already DEFAULTS to it. A hand-rolled
// `renderError={() => <Text>…</Text>}` re-grows the 28-arm drift the battery was built to end (D72).
//
// AUTHORITY IS reviewed-grant, and the legacy PATH ALLOWLIST could not be copied. Its rows suppressed EVERY
// matching occurrence in a file, which the final law forbids; each justified occurrence now needs its own
// exact `(subject, operation)` row. Two things fell out of doing that honestly:
//   · the command-palette row is DELETED, not translated. Its arm now roots in `<QueryErrorState>` (with a
//     custom retry button), so it produces no finding at all and a row for it would be STALE — the legacy
//     mode-A tripwire could not see that, because it only asked whether the file still had a `renderError`.
//   · the mint's own passthrough (`renderError={renderError}` inside query-boundary.tsx) is NOT A SUBJECT
//     under the corrected question: it sits on `<QueryErrorCatch>`, not on a `QueryBoundary`. Its
//     `SANCTIONED_HOMES` row is deleted as a detector artifact rather than translated into a grant.
//
// IDENTITY, NOT SPELLING, on BOTH halves. The legacy check accepted ANY element with a `renderError` prop
// and read the tag name TEXT (`=== "QueryErrorState"`) to decide the arm was the battery — so a local
// component of that name satisfied it and a re-export/alias of the real one did not. The subject is now a
// `renderError` prop on the canonical `QueryBoundary`, and the sanctioned arm is one rooting in the
// canonical `QueryErrorState`; both homes are located in the population and receipted, so a rename REFUSES
// the run instead of silently passing every arm.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import type { LocatedProjectHome, ProjectHomeDeclaration } from "../lib/project-home-origin.ts";
import { classifyProjectHomeOrigin, locateProjectHome } from "../lib/project-home-origin.ts";
import { referenceResolutionServices } from "../lib/reference-fact.ts";
import type { ReviewedGrantCandidate } from "../lib/reviewed-grant-findings.ts";
import { reportReviewedGrantCandidates } from "../lib/reviewed-grant-findings.ts";

const ATTRIBUTE = "renderError";
const OPERATION = "custom-render-error";
const BOUNDARY_HOME: ProjectHomeDeclaration = { path: "packages/client/src/components/query-boundary.tsx", names: ["QueryBoundary"] };
const BATTERY_HOME: ProjectHomeDeclaration = { path: "packages/client/src/data/query-error-state.tsx", names: ["QueryErrorState"] };

const MESSAGE =
  "a hand-rolled `renderError` arm on QueryBoundary — the read-error surface is `QueryErrorState` " +
  "(`Couldn't load <label>.` plus a real refetch Retry), and QueryBoundary DEFAULTS to it. Render " +
  "`renderError={(_error, retry) => <QueryErrorState label=… onRetry={retry} />}` or drop the prop " +
  "(derive-modernization-audit.md §W4 G29; D72 — a machine ships WITH its seal).";
const UNREADABLE =
  "this `renderError` arm sits on something spelled like QueryBoundary whose binding the shared readers cannot place, so whether the battery contract applies CANNOT be established. Reported rather than passed: the spelling alone is not the identity. Give the binding a readable import origin; the three-answer rule is tooling/src/verify/lib/origin-verdict.ts (#944).";
const FIX =
  "render <QueryErrorState label=… onRetry={retry} /> from the arm, or omit the prop for the default; a genuinely custom error surface needs an exact reviewed grant.";

interface Ranged {
  readonly node: MorphNode;
  readonly start: number;
  readonly end: number;
  readonly file: object;
}

function ranged(node: MorphNode): Ranged {
  return { node, start: node.getStart(), end: node.getEnd(), file: node.getSourceFile().compilerNode };
}

function contains(outer: Ranged, inner: Ranged): boolean {
  return outer.file === inner.file && outer.start <= inner.start && inner.end <= outer.end;
}

/** The tag-name node of a JSX element, whatever its spelling. */
function tagNameOf(node: MorphNode): MorphNode | null {
  if (Node.isJsxSelfClosingElement(node) || Node.isJsxOpeningElement(node)) {
    return node.getTagNameNode();
  }
  return null;
}

/** Does this expression ROOT in the canonical battery — a bare reference to it, or a JSX element whose tag
 *  resolves to it? Root, not "contains": a wrapper around the battery is a different surface, which is the
 *  narrowing the live message-list plate was written against. */
function rootsInBattery(expression: MorphNode, battery: LocatedProjectHome): boolean {
  const unwrapped = referenceResolutionServices.unwrapExpression(expression);
  const element = Node.isJsxElement(unwrapped) ? unwrapped.getOpeningElement() : unwrapped;
  const tag = tagNameOf(element);
  if (tag !== null) {
    return classifyProjectHomeOrigin(tag, battery) === "home";
  }
  return Node.isIdentifier(unwrapped) && classifyProjectHomeOrigin(unwrapped, battery) === "home";
}

interface ArmJudgment {
  readonly attribute: MorphNode;
  readonly tag: MorphNode;
  readonly subject: string;
  readonly boundary: LocatedProjectHome;
  readonly battery: LocatedProjectHome;
  readonly returns: readonly { readonly range: Ranged; readonly expression: MorphNode }[];
}

/** The arm expression a `renderError` attribute carries, or null when it has none. */
function armExpression(attribute: MorphNode): MorphNode | null {
  const initializer = Node.isJsxAttribute(attribute) ? attribute.getInitializer() : undefined;
  if (initializer === undefined || !Node.isJsxExpression(initializer)) {
    return null;
  }
  return initializer.getExpression() ?? null;
}

/** Is this arm the sanctioned battery shape? A concise body must root in it; a block body is judged by the
 *  return statements lying inside it, which is the set the legacy descendant walk produced. */
function isBatteryArm(expression: MorphNode, judgment: ArmJudgment): boolean {
  const arm = referenceResolutionServices.unwrapExpression(expression);
  const body = Node.isArrowFunction(arm) || Node.isFunctionExpression(arm) ? arm.getBody() : arm;
  if (!Node.isBlock(body)) {
    return rootsInBattery(body, judgment.battery);
  }
  const range = ranged(body);
  return judgment.returns.some((candidate) => contains(range, candidate.range) && rootsInBattery(candidate.expression, judgment.battery));
}

/** One `renderError` occurrence's verdict, as a grant candidate or nothing. */
function judgeArm(judgment: ArmJudgment): ReviewedGrantCandidate | null {
  const verdict = classifyProjectHomeOrigin(judgment.tag, judgment.boundary);
  if (verdict === "other") {
    return null;
  }
  const base = { node: judgment.attribute, subject: judgment.subject, operation: OPERATION, token: ATTRIBUTE, offset: 0 };
  if (verdict === "unreadable") {
    return { ...base, unreadable: true };
  }
  const expression = armExpression(judgment.attribute);
  if (expression === null || isBatteryArm(expression, judgment)) {
    return null;
  }
  return base;
}

export const gate = defineGate({
  id: "render-error-via-battery",
  family: "render-error-via-battery",
  authority: "reviewed-grant",
  severity: "error",
  population: "@client",
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const attributes: { readonly attribute: MorphNode; readonly tag: MorphNode; readonly subject: string }[] = [];
    const returns: { readonly range: Ranged; readonly expression: MorphNode }[] = [];
    return {
      visitors: [
        {
          kinds: [SyntaxKind.JsxAttribute],
          visit: (node, sourceFile): void => {
            if (!Node.isJsxAttribute(node) || node.getNameNode().getText() !== ATTRIBUTE) {
              return;
            }
            // JsxAttribute → JsxAttributes → the opening/self-closing element that carries the prop.
            const host = node.getParent().getParent();
            const tag = host === undefined ? null : tagNameOf(host);
            if (tag !== null) {
              attributes.push({ attribute: node, tag, subject: ctx.relativePath(sourceFile) });
            }
          },
        },
        {
          // The RETURN index: an arm with a block body returns its surface from somewhere inside, and a
          // policy may not walk descendants. The dispatcher already delivers every ReturnStatement, so the
          // arm's own returns are the ones lying inside its range — the same set the legacy
          // `getDescendantsOfKind(ReturnStatement)` produced, including a nested function's.
          kinds: [SyntaxKind.ReturnStatement],
          visit: (node): void => {
            if (!Node.isReturnStatement(node)) {
              return;
            }
            const expression = node.getExpression();
            if (expression !== undefined) {
              returns.push({ range: ranged(node), expression });
            }
          },
        },
      ],
      evaluate: (): void => {
        const boundary = locateProjectHome(ctx.files, ctx.relativePath, BOUNDARY_HOME);
        const battery = locateProjectHome(ctx.files, ctx.relativePath, BATTERY_HOME);
        // ZERO members on either home is a REFUSAL: the boundary this rule is about, or the battery it
        // points every author at, was renamed or moved.
        ctx.receipt({ kind: "population", source: BOUNDARY_HOME.path, members: boundary.members, unresolved: boundary.unresolved });
        ctx.receipt({ kind: "population", source: BATTERY_HOME.path, members: battery.members, unresolved: battery.unresolved });
        if (boundary.sourceFile === undefined || battery.sourceFile === undefined) {
          return;
        }
        const candidates = attributes
          .map(({ attribute, tag, subject }) => judgeArm({ attribute, tag, subject, boundary, battery, returns }))
          .filter((candidate): candidate is ReviewedGrantCandidate => candidate !== null);
        reportReviewedGrantCandidates(ctx.report, candidates, { message: MESSAGE, fix: FIX, unreadableMessage: UNREADABLE });
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      grant: { subject: "packages/client/src/features/a/x.tsx", operation: "custom-render-error" },
      files: {
        "packages/client/src/components/query-boundary.tsx":
          "export declare function QueryBoundary(props: { renderError?: unknown; children?: unknown }): unknown;\n",
        "packages/client/src/data/query-error-state.tsx":
          "export declare function QueryErrorState(props: { label?: string; onRetry?: () => void }): unknown;\n",
        "packages/client/src/features/a/x.tsx":
          'import { QueryBoundary } from "../../components/query-boundary.tsx";\nexport const G = () => <QueryBoundary renderError={() => <span>failed</span>} />;\n',
      },
      expect: { count: 1, token: ATTRIBUTE },
      why: "the founding shape — an inline arm rendering a hand-rolled surface where the battery belongs",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/components/query-boundary.tsx":
          "export declare function QueryBoundary(props: { renderError?: unknown; children?: unknown }): unknown;\n",
        "packages/client/src/data/query-error-state.tsx":
          "export declare function QueryErrorState(props: { label?: string; onRetry?: () => void }): unknown;\n",
        "packages/client/src/features/rpg/lib/rpg-context-section.tsx":
          'import { QueryBoundary } from "../../../components/query-boundary.tsx";\nexport const A = () => <QueryBoundary renderError={() => <span>alert</span>} />;\nexport const B = () => <QueryBoundary renderError={() => <span>alert</span>} />;\n',
      },
      expect: { count: 1 },
      why: "GRANT GRANULARITY, and the exact shape the legacy file allowlist could not express: the rpg pane's TWO custom arms in one file are ONE `(subject, operation)` finding and therefore ONE reviewed row, where the legacy row silently licensed every occurrence in the file",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/components/query-boundary.tsx":
          "export declare function QueryBoundary(props: { renderError?: unknown; children?: unknown }): unknown;\n",
        "packages/client/src/data/query-error-state.tsx":
          "export declare function QueryErrorState(props: { label?: string; onRetry?: () => void }): unknown;\n",
        "packages/client/src/features/a/wrapped.tsx":
          'import { QueryBoundary } from "../../components/query-boundary.tsx";\nimport { QueryErrorState } from "../../data/query-error-state.tsx";\nexport const G = () => <QueryBoundary renderError={() => <div><QueryErrorState label="x" /></div>} />;\n',
      },
      expect: { count: 1 },
      why: "A WRAPPER AROUND the battery is not the battery: the arm must ROOT in it. This is the narrowing the live message-list plate was written against, kept deliberately",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/components/query-boundary.tsx":
          "export declare function QueryBoundary(props: { renderError?: unknown; children?: unknown }): unknown;\n",
        "packages/client/src/data/query-error-state.tsx":
          "export declare function QueryErrorState(props: { label?: string; onRetry?: () => void }): unknown;\n",
        "packages/client/src/features/a/impostor.tsx":
          'import { QueryBoundary } from "../../components/query-boundary.tsx";\nfunction QueryErrorState(): unknown {\n  return null;\n}\nexport const G = () => <QueryBoundary renderError={() => <QueryErrorState />} />;\n',
      },
      expect: { count: 1 },
      why: "THE COUNTERFACTUAL ON THE ARM: a LOCAL component with the battery's name satisfied the legacy tag-TEXT check exactly. Only the canonical declaration separates the real battery from a lookalike",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/components/query-boundary.tsx":
          "export declare function QueryBoundary(props: { renderError?: unknown; children?: unknown }): unknown;\n",
        "packages/client/src/data/query-error-state.tsx":
          "export declare function QueryErrorState(props: { label?: string; onRetry?: () => void }): unknown;\n",
        "packages/client/src/features/a/foreign-return.tsx":
          'import { QueryBoundary } from "../../components/query-boundary.tsx";\nimport { QueryErrorState } from "../../data/query-error-state.tsx";\nexport function Sibling(): unknown {\n  return <QueryErrorState label="elsewhere" />;\n}\nexport const G = () => (\n  <QueryBoundary\n    renderError={() => {\n      return <span>failed</span>;\n    }}\n  />\n);\n',
      },
      expect: { count: 1, token: ATTRIBUTE },
      why: "THE CONTAINMENT TEST, and it IS the conversion's correctness claim: the return INDEX holds every `ReturnStatement` in the file, because a policy may not walk descendants, so only `contains(range, candidate.range)` narrows it back to the arm's own block — the set the legacy `getDescendantsOfKind` produced from the arm itself. This file has two return sites with OPPOSITE verdicts: the arm's block returns a hand-rolled `<span>`, and a sibling function beside it returns the canonical battery. Cut the containment test and the sibling's return acquits the arm, taking this row to ZERO findings. DIRECTION: unlike every other fence here, removing this one makes the policy flag LESS — it widens the acquitting set — so the row that dies is a `mustFlag`, not a `mustPass`",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/components/query-boundary.tsx":
          "export declare function QueryBoundary(props: { renderError?: unknown; children?: unknown }): unknown;\n",
        "packages/client/src/data/query-error-state.tsx":
          "export declare function QueryErrorState(props: { label?: string; onRetry?: () => void }): unknown;\n",
        "packages/client/src/features/a/opaque.tsx": "declare const ns: any;\nexport const G = () => <ns.QueryBoundary renderError={() => null} />;\n",
      },
      expect: { count: 1, messageIncludes: "CANNOT be established" },
      why: "THE FAIL-CLOSED THIRD ANSWER (#944), reached by no row before #2014: a member TAG off an OPAQUE namespace gives its name node no symbol, so `classifyProjectHomeOrigin` answers case (b) and `judgeArm` returns the unreadable candidate WITHOUT asking whether the arm roots in the battery — an arm on a host that might be QueryBoundary is reported, never silently passed. The `messageIncludes` is the only discriminator: the arm anchors on the same `renderError` attribute and emits the same single finding as the ordinary verdict, so a bare `{ count: 1 }` would pass with the arm dead",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/client/src/components/query-boundary.tsx":
          "export declare function QueryBoundary(props: { renderError?: unknown; children?: unknown }): unknown;\n",
        "packages/client/src/data/query-error-state.tsx":
          "export declare function QueryErrorState(props: { label?: string; onRetry?: () => void }): unknown;\n",
        "packages/client/src/features/a/x.tsx":
          'import { QueryBoundary } from "../../components/query-boundary.tsx";\nexport const G = () => <QueryBoundary />;\n',
      },
      why: "no `renderError` prop at all — QueryBoundary defaults to the battery, which is the ideal case",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/components/query-boundary.tsx":
          "export declare function QueryBoundary(props: { renderError?: unknown; children?: unknown }): unknown;\n",
        "packages/client/src/data/query-error-state.tsx":
          "export declare function QueryErrorState(props: { label?: string; onRetry?: () => void }): unknown;\n",
        "packages/client/src/features/a/y.tsx":
          'import { QueryBoundary } from "../../components/query-boundary.tsx";\nimport { QueryErrorState } from "../../data/query-error-state.tsx";\nexport const G = () => <QueryBoundary renderError={(retry: () => void) => <QueryErrorState label="x" onRetry={retry} />} />;\n',
      },
      why: "the sanctioned arm: it roots in the canonical battery",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/components/query-boundary.tsx":
          "export declare function QueryBoundary(props: { renderError?: unknown; children?: unknown }): unknown;\n",
        "packages/client/src/data/query-error-state.tsx":
          "export declare function QueryErrorState(props: { label?: string; onRetry?: () => void }): unknown;\n",
        "packages/client/src/features/chat/surfaces/command-palette-surface.tsx":
          'import { QueryBoundary } from "../../../components/query-boundary.tsx";\nimport { QueryErrorState } from "../../../data/query-error-state.tsx";\nexport const G = () => (\n  <QueryBoundary\n    renderError={(retry: () => void) => (\n      <QueryErrorState label="recent threads" onRetry={retry} renderRetry={() => <button type="button">Retry</button>} />\n    )}\n  />\n);\n',
      },
      why: "THE DELETED ROW, as it stands today: the command palette's arm roots in the battery with a custom retry BUTTON, so it is not a finding and a grant row for it would be STALE. The legacy allowlist row survived only because its mode-A sweep asked whether the file still had a `renderError`, never whether that arm was still custom",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/components/query-boundary.tsx":
          "export declare function QueryErrorCatch(props: { renderError?: unknown }): unknown;\nexport declare function QueryBoundary(props: { renderError?: unknown; children?: unknown }): unknown;\nexport const Inner = (renderError: unknown) => <QueryErrorCatch renderError={renderError} />;\n",
        "packages/client/src/data/query-error-state.tsx":
          "export declare function QueryErrorState(props: { label?: string; onRetry?: () => void }): unknown;\n",
      },
      why: "THE MINT'S PASSTHROUGH, passing by identity rather than by exclusion: it sits on `<QueryErrorCatch>`, not on a QueryBoundary, so it is out of subject. That is why its `SANCTIONED_HOMES` row is deleted instead of translated",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/components/query-boundary.tsx":
          "export declare function QueryBoundary(props: { renderError?: unknown; children?: unknown }): unknown;\n",
        "packages/client/src/data/query-error-state.tsx":
          "export declare function QueryErrorState(props: { label?: string; onRetry?: () => void }): unknown;\n",
        "packages/client/src/features/a/other.tsx":
          "declare function OtherBoundary(props: { renderError?: unknown }): unknown;\nexport const G = () => <OtherBoundary renderError={() => <span>x</span>} />;\n",
      },
      why: "THE COUNTERFACTUAL ON THE HOST: an unrelated component with a `renderError` prop is not QueryBoundary — the legacy gate keyed on the PROP alone and would have judged this one too",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/components/query-boundary.tsx":
          "export declare function QueryBoundary(props: { renderError?: unknown; children?: unknown }): unknown;\n",
        "packages/client/src/data/query-error-state.tsx":
          "export declare function QueryErrorState(props: { label?: string; onRetry?: () => void }): unknown;\n",
        "packages/client/src/features/a/block.tsx":
          'import { QueryBoundary } from "../../components/query-boundary.tsx";\nimport { QueryErrorState } from "../../data/query-error-state.tsx";\nexport const G = () => (\n  <QueryBoundary\n    renderError={(retry: () => void) => {\n      return <QueryErrorState label="x" onRetry={retry} />;\n    }}\n  />\n);\n',
      },
      why: "a BLOCK-bodied arm returning the battery is the same sanctioned shape — the return index is what a policy uses where the legacy gate walked descendants",
    },
  ],
});

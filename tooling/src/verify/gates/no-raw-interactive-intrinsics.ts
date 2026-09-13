// Policy: no-raw-interactive-intrinsics (design-enforcement.md §3.2, D62) — interactivity in a feature
// comes from an `@orb/ui` primitive. A hand-rolled `<button>`, `<input>`, `<select>`, `<textarea>` or
// `<a href>` re-implements focus rings, disabled semantics, sizing, density and touch floors by hand, and
// does it differently every time.
//
// AUTHORITY IS reviewed-grant, which is the 2026-08-22 SCAN-AND-ALLOWLIST ruling carried forward rather
// than reversed: the shell tier is SCANNED and exempted by a cited row plus a rename tripwire, never
// scoped out of the population. Under the final runtime the row is an exact `(subject, operation)` grant
// in `lib/reviewed-grants.ts` and the tripwire is central liveness — a home that stops hosting a raw
// intrinsic reds at its unused row, and a NEW shell file hosting one is a finding until someone reviews
// it. That is strictly finer than the legacy DIRECTORY row, which licensed every current and future file
// under `features/app-shell/`.
//
// THE EMPTY `BURN_DOWN` TABLE IS DELETED, per the exception census's delete list: all three original rows
// (persona avatar, persona-settings backup restore, character portrait) migrated to `@orb/ui/file-trigger`
// and the table has been empty since. An empty table plus its stale-arm sweep is machinery guarding
// nothing; central grant liveness is the replacement for both.
//
// NO IDENTITY READER, deliberately. The subject is a JSX INTRINSIC — a lowercase tag is the DOM element by
// language rule, and it cannot be aliased, re-exported, or shadowed by a project component (a component
// tag must be capitalised or a member expression). The identity IS the spelling here, which is why this
// policy resolves nothing and says so rather than performing a resolution that could only ever agree.
//
// DECLARED NARROWING (its own mustPass rows): an `<a>` with no `href` is an anchor TARGET, not a control.
import type { JsxOpeningElement, JsxSelfClosingElement, Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import type { ReviewedGrantCandidate } from "../lib/reviewed-grant-findings.ts";
import { reportReviewedGrantCandidates } from "../lib/reviewed-grant-findings.ts";

const BANNED_TAGS: ReadonlySet<string> = new Set(["button", "input", "select", "textarea"]);
const ANCHOR = "a";
const HREF = "href";
const OPERATION = "raw-interactive-intrinsic";

const MESSAGE =
  "a raw interactive intrinsic in a feature (design-enforcement.md §3.2, D62) — interactivity in " +
  "features/** comes from an @orb/ui primitive (Button, TextField, Select, TextArea, Link, …), never a " +
  "hand-rolled <button>/<input>/<select>/<textarea>/<a href>. The shell tier composes the app frame below " +
  "the primitive layer and is licensed one FILE at a time by an exact reviewed grant.";
const UNREADABLE = MESSAGE;
const FIX = "reach for the matching @orb/ui primitive (Button, TextField, Select, TextArea, Link); a shell-tier home takes an exact reviewed grant.";

/** The JSX tag delivered to the visitor, in either spelling. */
function jsxElement(node: MorphNode): JsxOpeningElement | JsxSelfClosingElement | undefined {
  return Node.isJsxOpeningElement(node) || Node.isJsxSelfClosingElement(node) ? node : undefined;
}

/** The banned intrinsic this tag opens, or undefined. An `<a>` counts only when it carries `href`. */
function bannedTag(element: JsxOpeningElement | JsxSelfClosingElement): string | undefined {
  const tag = element.getTagNameNode().getText();
  if (BANNED_TAGS.has(tag)) {
    return tag;
  }
  if (tag !== ANCHOR) {
    return;
  }
  const interactive = element.getAttributes().some((attribute) => Node.isJsxAttribute(attribute) && attribute.getNameNode().getText() === HREF);
  return interactive ? ANCHOR : undefined;
}

export const gate = defineGate({
  id: "no-raw-interactive-intrinsics",
  family: "no-raw-interactive-intrinsics",
  authority: "reviewed-grant",
  severity: "error",
  // The shell is SCANNED, not scoped out (the 2026-08-22 ruling): nothing is subtracted, and the one home
  // that hosts a raw control is a grant row. `.tsx` stays a scope decision — a file KIND, not a home.
  population: { in: ["@client"], under: ["packages/client/src/features/**"], ext: ["tsx"] },
  analysis: "syntax",
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
          kinds: [SyntaxKind.JsxOpeningElement, SyntaxKind.JsxSelfClosingElement],
          visit: (node, sourceFile): void => {
            const element = jsxElement(node);
            const tag = element === undefined ? undefined : bannedTag(element);
            if (element === undefined || tag === undefined) {
              return;
            }
            candidates.push({
              node: element.getTagNameNode(),
              subject: ctx.relativePath(sourceFile),
              operation: `${OPERATION}:${tag}`,
              token: tag,
              offset: 0,
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
      mode: "source",
      grant: { subject: "packages/client/src/features/demo/thing.tsx", operation: "raw-interactive-intrinsic:button" },
      files: { "packages/client/src/features/demo/thing.tsx": 'export const G = (): unknown => <button type="button">Go</button>;\n' },
      expect: { count: 1, token: "button" },
      why: "the founding shape — a hand-rolled control in a feature, which must be an @orb/ui Button",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/demo/link.tsx": 'export const G = (): unknown => <a href="/x">go</a>;\n' },
      expect: { count: 1, token: "a" },
      why: "an `<a>` carrying href is a control — it must be an @orb/ui Link",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/demo/input.tsx": 'export const G = (): unknown => <input type="text" />;\n' },
      expect: { count: 1, token: "input" },
      why: "a raw <input> — an @orb/ui TextField",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/demo/select.tsx": "export const G = (): unknown => (\n  <select>\n    <option>a</option>\n  </select>\n);\n" },
      expect: { count: 1, token: "select" },
      why: "a raw <select> — an @orb/ui Select",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/demo/textarea.tsx": "export const G = (): unknown => <textarea />;\n" },
      expect: { count: 1, token: "textarea" },
      why: "a raw <textarea> — an @orb/ui TextArea",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/app-shell/surfaces/app-shell.tsx": 'export const G = (): unknown => <button type="button">Shell</button>;\n' },
      expect: { count: 1, token: "button" },
      why: "THE PERMISSION IS NOT A CARVE-OUT IN THE RULE: the shell tier is SCANNED (the 2026-08-22 ruling) and reds like any other feature file, licensed by its exact grant row — so a SECOND shell file hosting a raw control is a finding until someone reviews it, which the legacy directory row could not express",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/client/src/features/demo/anchor.tsx": "export const G = (): unknown => <a>anchor target</a>;\n" },
      why: "THE DECLARED NARROWING: a non-interactive `<a>` with no href is an anchor TARGET, not a control",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/demo/anchor-name.tsx": 'export const G = (): unknown => <a name="top">top</a>;\n' },
      why: "an `<a name>` with no href is the same target species — still not a control",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/demo/primitive.tsx": "export const G = (): unknown => <Button>Go</Button>;\n" },
      why: "the fix: an @orb/ui primitive. A CAPITALISED tag is a component by language rule, never an intrinsic — which is why this policy resolves no identity",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/demo/anchor.tsx": "export const G = (): unknown => null;\n",
        "packages/ui/src/primitives/button/button.tsx": 'export const B = (): unknown => <button type="button">Go</button>;\n',
      },
      why: "SCOPE: outside `features/**` a ui primitive legally hosts the raw element — that is where the one implementation belongs",
    },
  ],
});

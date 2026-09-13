// Policy: no-untrusted-html-in-main-dom (UI-Theming-and-Content.md §12.2, D44) — raw HTML reaches the user
// through the sandboxed iframe (`<SandboxFrame>`: srcdoc + per-frame CSP) or the sanitized `@orb/ui/markdown`
// seal, never through the app document.
//
// AUTHORITY IS reviewed-grant, WITH NO ROWS TODAY, and that is the honest translation of the legacy table.
// The two seal homes were `SANCTIONED_HOMES` rows whose own `why` said the permission is "the architecture's
// standing answer to where rendered HTML may go, WHETHER OR NOT it spells the injection today" — and on this
// tree NEITHER seal spells it (markdown renders through Streamdown's sanitizer, sandbox-frame through
// `srcdoc`). A grant row consumed zero times after a complete run is STALE by contract, so a row for an
// UNEXERCISED permission is not representable and must not be invented. The seals are simply SCANNED and
// clean. What survives is the authority: an exception to a D44 security rule is a REVIEWED row, never an
// inline marker a single author can write — so if a seal ever does inject, it reds and the review mints the
// row then.
//
// THE SUBJECT IS A RESERVED JSX ATTRIBUTE, and this is the one policy in the family whose identity is a
// keyword rather than a binding: `dangerouslySetInnerHTML` is React's DOM contract, not an importable
// symbol, so there is nothing to alias, re-export or shadow. DECLARED LIMIT with its own row: prop injection
// through a SPREAD (`<div {...{ dangerouslySetInnerHTML: html }} />`) carries no attribute node and is not
// seen — the same limit the legacy gate carried and the census recorded.
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import type { ReviewedGrantCandidate } from "../lib/reviewed-grant-findings.ts";
import { reportReviewedGrantCandidates } from "../lib/reviewed-grant-findings.ts";

const ATTRIBUTE = "dangerouslySetInnerHTML";
const OPERATION = "raw-html-injection";

const MESSAGE =
  "`dangerouslySetInnerHTML` in the app DOM — untrusted HTML MUST go through `<SandboxFrame>` (sandboxed " +
  "iframe + per-frame CSP) or the sanitized `@orb/ui/markdown` seal (D44 — UI-Theming-and-Content.md §12.2). " +
  "Never inject raw HTML into the main document.";
const FIX =
  "render through <SandboxFrame> or the @orb/ui/markdown seal; a genuinely new sanctioned destination needs an exact reviewed grant, not an inline waiver.";

export const gate = defineGate({
  id: "no-untrusted-html-in-main-dom",
  family: "no-untrusted-html-in-main-dom",
  authority: "reviewed-grant",
  severity: "error",
  // The legacy scope regex was `/packages/(client|ui)/src/`; the seal homes are NOT subtracted.
  population: ["@client", "@ui"],
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
          kinds: [SyntaxKind.JsxAttribute],
          visit: (node, sourceFile): void => {
            if (!Node.isJsxAttribute(node) || node.getNameNode().getText() !== ATTRIBUTE) {
              return;
            }
            candidates.push({ node, subject: ctx.relativePath(sourceFile), operation: OPERATION, token: ATTRIBUTE, offset: 0 });
          },
        },
      ],
      evaluate: (): void => {
        reportReviewedGrantCandidates(ctx.report, candidates, { message: MESSAGE, fix: FIX, unreadableMessage: MESSAGE });
      },
    };
  },
  mustFlag: [
    {
      mode: "source",
      grant: { subject: "packages/client/src/components/foo.tsx", operation: "raw-html-injection" },
      files: { "packages/client/src/components/foo.tsx": "export const A = () => <div dangerouslySetInnerHTML={{ __html: 'x' }} />;\n" },
      expect: { count: 1, token: ATTRIBUTE },
      why: "the founding shape — raw HTML injected into the app document",
    },
    {
      mode: "source",
      files: { "packages/ui/src/markdown/index.tsx": "export const M = () => <div dangerouslySetInnerHTML={{ __html: 'x' }} />;\n" },
      expect: { count: 1 },
      why: "THE SEAL REDS TOO: the markdown home carries no live injection on this tree, so it holds no grant row. If it ever injects, this is the finding that brings the decision to review — which is what replaced a standing directory exemption that licensed nothing",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/components/two.tsx":
          "export const A = () => <div dangerouslySetInnerHTML={{ __html: 'x' }} />;\nexport const B = () => <span dangerouslySetInnerHTML={{ __html: 'y' }} />;\n",
      },
      expect: { count: 1 },
      why: "GRANT GRANULARITY: two injections in one file are ONE `(subject, operation)` finding, because a row matching both would be OVER-BROAD and would license neither",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/client/src/components/foo.tsx": "export const A = () => <div>{'x'}</div>;\n" },
      why: "ordinary JSX with no injection at all",
    },
    {
      mode: "source",
      files: { "packages/client/src/components/attr.tsx": "export const A = () => <div className='x' />;\n" },
      why: "THE ATTRIBUTE-NAME FENCE, and it is the WHOLE subject of a D44 SECURITY policy over 1685 files: an ordinary JSX attribute is visited (the visitor's kind set is every `JsxAttribute`) and is rejected ONLY by the name comparison. Cut `node.getNameNode().getText() !== ATTRIBUTE` and this row flags `className` — the two counterfactuals beside it carry no JSX attribute node at all and stay green through that cut, so neither one pins it",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/components/config.ts": "export const options = { dangerouslySetInnerHTML: false };\n",
      },
      why: "A PROPERTY of the same name in a plain object is not a JSX attribute — the subject is the reserved attribute POSITION, not the word",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/components/spread.tsx": "const html = { __html: 'x' };\nexport const A = () => <div {...{ dangerouslySetInnerHTML: html }} />;\n",
      },
      why: "THE DECLARED LIMIT, written down: prop injection through a SPREAD carries no attribute node and is not seen. The legacy gate had the same limit and the exception census recorded it; closing it needs a JSX prop-provenance fact no shared reader supplies today",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/x/render.ts": 'export const html = "<div dangerouslySetInnerHTML>";\n',
        "packages/client/src/components/foo.tsx": "export const A = () => <div>{'x'}</div>;\n",
      },
      why: "THE POPULATION: the app DOM is client and ui source, so a server module is not judged at all — the client file is present because a population that admits zero paths REFUSES by contract, which would make this row prove nothing",
    },
  ],
});

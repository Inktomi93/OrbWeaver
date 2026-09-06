// Policy: no-rejected-cors-proxy (Core-Path-Registry.md D61 / B5a) — the `corsproxy.io` half of the old
// `no-raw-egress` module, split off because its AUTHORITY is different. Routing egress through the
// named-rejected third-party CORS proxy was decided against in D61; there is no home that may do it and
// no occurrence that could earn a marker, so the policy is HARD and carries no suppression door at all.
// The raw-`fetch` half is `no-raw-egress` (reviewed-grant), and one descriptor cannot hold both.
//
// The subject is a LITERAL, not an identity: the point of the rule is that the host cannot be SPELLED in
// server source, in a string or in any part of a template. Comments are outside the subject because only
// literal nodes are delivered — a header explaining why the proxy is banned must stay writable.
import type { Node as MorphNode } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

const CORSPROXY = "corsproxy.io";

const STRING_KINDS: readonly SyntaxKind[] = [
  SyntaxKind.StringLiteral,
  SyntaxKind.NoSubstitutionTemplateLiteral,
  SyntaxKind.TemplateHead,
  SyntaxKind.TemplateMiddle,
  SyntaxKind.TemplateTail,
];

const MESSAGE =
  "`corsproxy.io` spelled in server source — the NAMED-REJECTED third-party CORS proxy (D61 B5a). Egress " +
  "never routes through it: a third party would see every URL, header and body the server sends. See " +
  "Core-Path-Registry.md D61 (B5a).";
const FIX = "delete the proxy host; route the request through `safeFetch` (infra/network) directly to the real origin.";

/** The TemplateHead proof row's fixture source. It must carry a real interpolation, so the placeholder
 *  rule is suppressed on the one line that holds it. */
// biome-ignore lint/suspicious/noTemplateCurlyInString: authored TypeScript inside a proof string — a real TemplateHead node is exactly what the row exercises.
const TEMPLATE_FIXTURE = "export const proxy = (url: string): string => `https://corsproxy.io/?url=${url}`;\n";

/** The offset of the banned host inside this literal's own authored text, or -1. */
function bannedOffset(node: MorphNode): number {
  return node.getText().indexOf(CORSPROXY);
}

export const gate = defineGate({
  id: "no-rejected-cors-proxy",
  family: "no-raw-egress",
  authority: "hard",
  severity: "error",
  population: "@server",
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    visitors: [
      {
        kinds: STRING_KINDS,
        visit: (node): void => {
          const offset = bannedOffset(node);
          if (offset >= 0) {
            ctx.report.node(node, { token: CORSPROXY, offset, message: MESSAGE, fix: FIX });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/server/src/domain/hub/lib/x.ts": 'export const proxy = "https://corsproxy.io/?url=";\n' },
      expect: { count: 1, token: CORSPROXY },
      why: "the founding shape — the rejected proxy spelled as a string literal anywhere in server source",
    },
    {
      mode: "source",
      files: { "packages/server/src/domain/hub/lib/tpl.ts": TEMPLATE_FIXTURE },
      expect: { count: 1, token: CORSPROXY },
      why: "the TEMPLATE spelling: the host lives in the head quasi, which is a different node kind and the same ban",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/server/src/domain/hub/lib/ok.ts": 'export const origin = "https://example.test/?url=";\n' },
      why: "an unrelated origin literal is not the banned host",
    },
    {
      mode: "source",
      files: { "packages/server/src/domain/hub/lib/why.ts": "// D61 rejected routing egress through a third-party CORS proxy.\nexport const proxy = null;\n" },
      why: "A COMMENT NAMING THE BAN IS NOT A VIOLATION — only literal nodes are delivered, so the header that explains the ruling stays writable. Written as a row because a text scan would have flagged it",
    },
  ],
});

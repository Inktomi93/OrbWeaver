// Raw intrinsic media tags in feature JSX must use MessageMedia. The syntax policy deliberately does not
// classify member/namespace component names that merely end in an intrinsic spelling.
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

const MESSAGE =
  "raw <img>/<video>/<audio> in a feature — media MUST go through <MessageMedia> (@orb/ui/content): asset-vs-external dispatch, external-source gating, autoplay-off on untrusted, broken-media fallback (D44 — UI-Theming-and-Content.md §12.3).";

const BANNED_TAGS = new Set(["img", "video", "audio", "source"]);

export const gate = defineGate({
  id: "no-external-media-without-gate",
  family: "no-external-media-without-gate",
  authority: "ordinary",
  severity: "error",
  population: { in: ["@client"], under: ["packages/client/src/features/**"] },
  analysis: "syntax",
  execution: "selected-files",
  resources: [],
  message: MESSAGE,
  fix: "use <MessageMedia> (@orb/ui/content) instead of raw elements.",
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.JsxSelfClosingElement, SyntaxKind.JsxOpeningElement],
        visit: (node) => {
          const tagNameNode = node.getFirstChildByKind(SyntaxKind.Identifier);
          const tagName = tagNameNode?.getText();
          if (tagName !== undefined && BANNED_TAGS.has(tagName)) {
            ctx.report.node(node);
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/client/src/features/x/x.tsx": 'export const G = <img src="bad" />;\n' },
      expect: { count: 1 },
      why: "img in feature",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/paired.tsx": 'export const G = <video><source src="bad" /></video>;\nexport const H = <audio src="bad" />;\n',
      },
      expect: { count: 3 },
      why: "paired and self-closing forms cover every other raw media intrinsic owned by the policy",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/client/src/features/x/x.tsx": "export const G = <MessageMedia />;\n" },
      why: "not a raw media element",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/control.tsx": "export const Control = <MessageMedia />;\n",
        "packages/client/src/components/x/x.tsx": 'export const G = <img src="ok" />;\n',
      },
      why: "not in features/",
    },
    {
      mode: "source",
      files: { "packages/client/src/features/x/member.tsx": "export const G = <Media.img />;\nexport const H = <svg:image />;\n" },
      why: "member and namespace component names are declared near-misses, not raw intrinsic tags",
    },
  ],
});

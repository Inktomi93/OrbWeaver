// Raw intrinsic media tags in feature JSX must use MessageMedia. The syntax policy deliberately does not
// classify member/namespace component names that merely end in an intrinsic spelling.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `no-external-media-without-gate` descriptor at 073520068d3305dfedbb481153cadfef6b30f847, the parent of the
// conversion `45743d76d` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over
// the SAME 7,006 harness candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy
// `scanRoot` admits 983 and final `population` admits 983. legacy − final = ∅. final − legacy = ∅. Controls: inside
// `packages/client/src/features/app-shell/anchors/__cbbhr_in_region-anchor.tsx` (virtual) admitted by both; outside
// `packages/client/src/agent-handles/__cbbhr_out_index.ts` (virtual) rejected by both.
//
// FAMILY: a declared SINGLETON under its own id. It imports nothing from `lib/`; the subject is an intrinsic tag
// spelling and no sibling judges it.
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
  facts: [],
  resources: [],
  message: MESSAGE,
  fix:
    "use <MessageMedia> (@orb/ui/content) instead of raw elements. A deliberate site is waived with " +
    "`@orb-waive no-external-media-without-gate(<position>): <reason>` on the line above, where <position> " +
    "is the derived position — the first identifier, literal or keyword of the reported element node.",
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
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/x.tsx":
          "// @orb-waive no-external-media-without-gate(img): the proof's stand-in reason; ends when this fixture stops flagging.\n" +
          'export const G = <img src="bad" />;\n',
      },
      why: "POSITIONAL IDENTITY: this report passes NO token, so the runtime DERIVES the position — the first identifier/literal/keyword in the reported element's text carrying no paren or newline, which is the TAG NAME `img` rather than the element or its src literal. Built on the founding mustFlag row — a ONE-finding fixture",
    },
  ],
});

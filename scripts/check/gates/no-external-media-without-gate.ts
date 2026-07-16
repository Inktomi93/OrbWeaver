import { SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const MESSAGE =
  "raw <img>/<video>/<audio> in a feature — media MUST go through <MessageMedia> (@orb/ui/content): asset-vs-external dispatch, external-source gating, autoplay-off on untrusted, broken-media fallback (D44 — UI-Theming-and-Content.md §12.3).";

const BANNED_TAGS = new Set(["img", "video", "audio", "source"]);

export const gate: GateDescriptor = {
  name: "no-external-media-without-gate",
  docRow: "UI-Gates-and-Lessons.md §12.6 / D44",
  status: "active",
  scopeSafety: "incremental-safe",
  message: MESSAGE,
  fix: "use <MessageMedia> (@orb/ui/content) instead of raw elements.",
  scanRoot: (p) => p.includes("packages/client/src/features/"),
  kinds: [SyntaxKind.JsxSelfClosingElement, SyntaxKind.JsxOpeningElement],
  visit: (node, _sf, ctx) => {
    const tagNameNode = node.getFirstChildByKind(SyntaxKind.Identifier);
    const tagName = tagNameNode?.getText();
    if (tagName && BANNED_TAGS.has(tagName)) {
      ctx.report(node);
    }
  },
  mustFlag: [
    {
      files: 'export const G = <img src="bad" />;\n',
      at: "packages/client/src/features/x/x.tsx",
      expect: { count: 1 },
      why: "img in feature",
    },
  ],
  mustPass: [
    {
      files: "export const G = <MessageMedia />;\n",
      at: "packages/client/src/features/x/x.tsx",
      why: "not a raw media element",
    },
    {
      files: 'export const G = <img src="ok" />;\n',
      at: "packages/client/src/components/x/x.tsx",
      why: "not in features/",
    },
  ],
};

import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineFact } from "../contract/fact.ts";
import type { GatePolicyContext } from "../contract/policy.ts";
import { readTailwindClassTokens } from "./tailwind-class-token.ts";
import { waivableCoordinate } from "./waivable-coordinate.ts";

export const UI_TIER_IDS = ["z-index", "skin-fragment", "pointer-capability"] as const;
export type UiTierId = (typeof UI_TIER_IDS)[number];

export interface UiTierHome {
  readonly path: string;
}

export const UI_TIER_HOMES = {
  "z-index": [{ path: "packages/ui/src/layout/" }, { path: "packages/ui/src/markdown/" }],
  "skin-fragment": [{ path: "packages/ui/src/lib/" }],
  "pointer-capability": [{ path: "packages/client/src/features/app-shell/" }],
} as const satisfies Readonly<Record<UiTierId, readonly UiTierHome[]>>;

export const Z_TOKEN_NAMES = ["base", "raised", "overlay", "modal", "popover", "toast", "tooltip"] as const;
const Z_TOKEN_SET: ReadonlySet<string> = new Set(Z_TOKEN_NAMES);
const Z_INDEX_REGEX = /\bz-(?:\d+|\[\d+\])/u;
const SEMANTIC_Z_REGEX = /\bz-\(--z-([a-z0-9-]+)\)/gu;
const POINTER_VARIANT_RE = /^(?:any-)?pointer-(?:coarse|fine):/u;
const CAPABILITY_MEDIA_RE = /\[@media\([^)]*(?:any-pointer|pointer|hover)\s*:[^)]*\)\]:/u;
const CLASS_COMPOSERS: ReadonlySet<string> = new Set(["cn", "clsx", "cva", "tv"]);

export const SKIN_SIGNATURES = [
  "focus-visible:ring-",
  "before:size-touch-target",
  "rotate-45 border border-border bg-popover",
  "bg-backdrop",
  "data-disabled:pointer-events-none data-disabled:opacity-50",
  "disabled:pointer-events-none disabled:opacity-50",
] as const;

export interface UiTierOccurrence {
  readonly tier: UiTierId;
  readonly node: MorphNode;
  readonly path: string;
  readonly token: string;
  readonly offset: number;
  readonly home: string | null;
}

export interface UiTierFacts {
  readonly occurrences: readonly UiTierOccurrence[];
  readonly files: readonly SourceFile[];
  readonly featureFiles: number;
  readonly receipt: { readonly source: string; readonly members: number };
}

function homeFor(tier: UiTierId, path: string): string | null {
  return UI_TIER_HOMES[tier].find((home) => path.startsWith(home.path))?.path ?? null;
}

function inClassCarrier(node: MorphNode): boolean {
  const jsx = node.getFirstAncestorByKind(SyntaxKind.JsxAttribute);
  if (jsx?.getNameNode().getText() === "className") {
    return true;
  }
  const call = node.getFirstAncestorByKind(SyntaxKind.CallExpression);
  return call !== undefined && CLASS_COMPOSERS.has(call.getExpression().getText());
}

function addOccurrence(occurrences: UiTierOccurrence[], occurrence: Omit<UiTierOccurrence, "home">): void {
  occurrences.push({ ...occurrence, token: waivableCoordinate(occurrence.token) ?? occurrence.token, home: homeFor(occurrence.tier, occurrence.path) });
}

function scanZIndex(occurrences: UiTierOccurrence[], node: MorphNode, path: string, text: string): void {
  if ((Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)) && inClassCarrier(node) && Z_INDEX_REGEX.test(text)) {
    addOccurrence(occurrences, { tier: "z-index", node, path, token: text, offset: 0 });
  }
  for (const match of text.matchAll(SEMANTIC_Z_REGEX)) {
    const name = match[1];
    if (name !== undefined && !Z_TOKEN_SET.has(name)) {
      addOccurrence(occurrences, { tier: "z-index", node, path, token: match[0], offset: match.index });
    }
  }
}

function scanSkin(occurrences: UiTierOccurrence[], node: MorphNode, path: string, text: string): void {
  if (!path.startsWith("packages/ui/src/")) {
    return;
  }
  for (const signature of SKIN_SIGNATURES) {
    const offset = text.indexOf(signature);
    if (offset !== -1) {
      addOccurrence(occurrences, { tier: "skin-fragment", node, path, token: signature, offset });
    }
  }
}

function scanPointer(occurrences: UiTierOccurrence[], node: MorphNode, path: string, text: string): void {
  if (!(path.startsWith("packages/client/src/features/") && (Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)))) {
    return;
  }
  for (const hit of readTailwindClassTokens(text)) {
    if (POINTER_VARIANT_RE.test(hit.token) || CAPABILITY_MEDIA_RE.test(hit.token)) {
      addOccurrence(occurrences, { tier: "pointer-capability", node, path, token: hit.token, offset: hit.offset });
    }
  }
}

export const uiTierPermissionFact = defineFact({
  id: "ui-tier-permissions",
  population: ["@client", "@ui"],
  analysis: "syntax",
  resources: [],
  create: (ctx) => {
    const occurrences: UiTierOccurrence[] = [];
    let featureFiles = 0;
    return {
      visitFile: (sourceFile) => {
        if (ctx.relativePath(sourceFile).startsWith("packages/client/src/features/")) {
          featureFiles += 1;
        }
      },
      visitors: [
        {
          kinds: [
            SyntaxKind.StringLiteral,
            SyntaxKind.NoSubstitutionTemplateLiteral,
            SyntaxKind.TemplateHead,
            SyntaxKind.TemplateMiddle,
            SyntaxKind.TemplateTail,
          ],
          visit: (node, sourceFile) => {
            const path = ctx.relativePath(sourceFile);
            const text = node.getText();
            scanZIndex(occurrences, node, path, text);
            scanSkin(occurrences, node, path, text);
            scanPointer(occurrences, node, path, text);
          },
        },
      ],
      finish: () => {
        const receipt = { source: "ui-tier-permission-sources", members: ctx.files.length };
        ctx.receipt({ kind: "population", ...receipt });
        return { occurrences, files: ctx.files, featureFiles, receipt };
      },
    };
  },
});

export function readUiTierFacts(ctx: GatePolicyContext): UiTierFacts {
  const facts = ctx.fact(uiTierPermissionFact);
  ctx.receipt({ kind: "population", ...facts.receipt });
  return facts;
}

export function tierOccurrences(facts: UiTierFacts, tier: UiTierId, home: string | null): readonly UiTierOccurrence[] {
  return facts.occurrences.filter((occurrence) => occurrence.tier === tier && occurrence.home === home);
}

export function liveHomeFiles(facts: UiTierFacts, home: string): readonly SourceFile[] {
  return facts.files.filter((file) => file.getFilePath().replaceAll("\\", "/").includes(`/${home}`));
}

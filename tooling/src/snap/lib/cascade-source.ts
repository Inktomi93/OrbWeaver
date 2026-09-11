// One source-owner classifier for browser cascade evidence. It maps only the five sanctioned CSS homes,
// the generated theme, dynamic/inline styles, and the trusted owner custom-CSS marker. Everything else
// remains explicit `opaque`; no URL guess silently becomes repository authority.
import type { CssCascadeSourceKind } from "../contract/cascade.ts";

const SOURCE_PATHS: readonly (readonly [needle: string, kind: CssCascadeSourceKind])[] = [
  ["/packages/client/src/features/app-shell/surfaces/shell.css", "shell"],
  ["/packages/client/src/styles/globals.css", "client-global"],
  ["/packages/ui/src/styles/theme.css", "generated-theme"],
  ["/packages/ui/src/styles/tiers.css", "ui-tier"],
  ["/packages/ui/src/styles/globals.css", "ui-global"],
] as const;

export const REPOSITORY_CASCADE_SOURCES: ReadonlySet<CssCascadeSourceKind> = new Set<CssCascadeSourceKind>([
  "client-global",
  "generated-theme",
  "shell",
  "ui-global",
  "ui-tier",
]);

export function classifyCascadeSource(input: {
  readonly styleType: string;
  readonly sourceUrl: string | null;
  readonly ownerCustomCss: boolean;
}): CssCascadeSourceKind {
  if (input.styleType === "Animation" || input.styleType === "Transition") {
    return "dynamic";
  }
  if (input.ownerCustomCss) {
    return "owner-custom-css";
  }
  if (input.styleType === "Inline") {
    return "inline";
  }
  if (input.sourceUrl === null) {
    return "opaque";
  }
  let path: string;
  // @orb-waive caught-failure-ownership(catch): malformed or unsupported source URLs fail closed to `opaque`, which never counts as a repository declaration. Ends if opaque sources become trusted or satisfy the nonzero repository population.
  try {
    path = decodeURIComponent(new URL(input.sourceUrl, "http://orb.invalid").pathname);
  } catch {
    return "opaque";
  }
  return SOURCE_PATHS.find(([needle]) => path.endsWith(needle))?.[1] ?? "opaque";
}

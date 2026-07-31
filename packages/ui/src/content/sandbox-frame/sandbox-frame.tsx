import type { CSSProperties, ReactElement } from "react";
import { buildSrcDoc, SANDBOX_ATTR } from "./srcdoc";
import { clampSandboxThemeTokens } from "./theme-tokens";
import { clampSandboxFontFamily } from "./use-sandbox-theme";

// With scripts OFF the frame cannot postMessage its scrollHeight, so height is caller-controlled, not self-measured.
const DEFAULT_HEIGHT_PX = 320;

export interface SandboxFrameProps {
  /** The untrusted HTML — handed to a sandboxed realm, NEVER sanitized into the main DOM. */
  readonly html: string;
  /** Optional card CSS (rides the sandboxed document's own `<style>`; cannot touch the app). */
  readonly css?: string;
  /** Re-clamped at this boundary via `isSafeColor` regardless of caller — see `theme-tokens.ts`. */
  readonly themeTokens?: Readonly<Record<string, string>>;
  /** Pre-validated font-family list for the base body rule (see `use-sandbox-theme.ts`); dropped when unsafe. */
  readonly fontFamily?: string;
  /** The row's resolved external-media verdict — widens the frame CSP to `https:` images/media. Default false
   *  (fail closed). The EMBEDDING document's CSP must allow it too: a srcdoc frame inherits the parent policy. */
  readonly allowExternalMedia?: boolean;
  readonly title: string;
  /** While false, a skeleton renders instead of the frame — a half-rendered flash is worse than a code fence. */
  readonly complete?: boolean;
  readonly heightPx?: number;
  /** Fill the parent instead of the fixed `heightPx` — the expanded/lightbox arm (the parent owns height). */
  readonly fill?: boolean;
  readonly className?: string;
}

/**
 * Renders untrusted self-contained HTML/CSS inside a sandboxed iframe. The iframe IS the security
 * boundary: `sandbox=""` gives it a null origin with no scripts and no same-origin, and a per-frame
 * CSP blocks any fetch/exfil. Interactivity is doored not walled — a trusted card later flips
 * `allow-scripts`, a one-attribute change here.
 */
export function SandboxFrame({
  html,
  css,
  themeTokens,
  fontFamily,
  allowExternalMedia = false,
  title,
  complete = true,
  heightPx = DEFAULT_HEIGHT_PX,
  fill = false,
  className,
}: SandboxFrameProps): ReactElement {
  const style: CSSProperties | undefined = fill ? undefined : { height: `${heightPx}px` };

  if (!complete) {
    return (
      <div className="w-full animate-pulse rounded-card border border-border bg-muted" style={style} data-slot="sandbox-frame-skeleton" aria-hidden={true} />
    );
  }

  const srcDoc = buildSrcDoc({
    html,
    css,
    themeTokens: clampSandboxThemeTokens(themeTokens),
    fontFamily: clampSandboxFontFamily(fontFamily),
    allowExternalMedia,
  });
  return (
    <iframe
      sandbox={SANDBOX_ATTR}
      srcDoc={srcDoc}
      title={title}
      loading="lazy"
      referrerPolicy="no-referrer"
      className={className ?? "w-full rounded-card border border-border bg-card"}
      style={style}
      data-slot="sandbox-frame"
    />
  );
}

import type { CSSProperties, ReactElement } from "react";
import { buildSrcDoc, SANDBOX_ATTR } from "./srcdoc";
import { clampSandboxThemeTokens } from "./theme-tokens";

// The default rendered height for a Tier-B card (px). See the auto-height note on the component: with
// scripts OFF the frame cannot postMessage its scrollHeight, so height is caller-controlled, not
// self-measured, in v1.
const DEFAULT_HEIGHT_PX = 320;

export interface SandboxFrameProps {
  /** The untrusted HTML — handed to a sandboxed realm, NEVER sanitized into the main DOM. */
  readonly html: string;
  /** Optional card CSS (rides the sandboxed document's own `<style>`; cannot touch the app). */
  readonly css?: string;
  /**
   * `--*` theme custom props so the card's `var(--accent)` tracks the app theme. Re-clamped at THIS
   * boundary via `isSafeColor` (the same predicate `<ThemeScope>` uses) regardless of the caller —
   * a caller bypassing ThemeScope cannot smuggle CSS through here (see `theme-tokens.ts`).
   */
  readonly themeTokens?: Readonly<Record<string, string>>;
  /** Required iframe title (a11y). */
  readonly title: string;
  /**
   * Render-on-complete (D44 §12.7): while false, a skeleton renders instead of the frame — the
   * half-rendered card flash is worse than a code-fence one. Defaults true (the block is done).
   */
  readonly complete?: boolean;
  /** Rendered height in px (see the auto-height note). Defaults to a sensible card height. */
  readonly heightPx?: number;
  readonly className?: string;
}

/**
 * `<SandboxFrame>` (D44 §12.2 Tier-B) — renders untrusted self-contained HTML/CSS inside a sandboxed
 * iframe. The iframe IS the security boundary: `sandbox=""` gives it a null origin with NO scripts
 * and NO same-origin (it cannot read our cookies/DOM/storage or run JS), and a per-frame CSP
 * (`default-src 'none'`, no `connect-src`) blocks any fetch/exfil. Untrusted HTML is never
 * sanitized-into-main-DOM. Interactivity is DOORED not walled — a trusted card later flips
 * `allow-scripts` (the Artifacts model), a one-attribute change here.
 *
 * AUTO-HEIGHT (recorded decision, ui-package-design §7): the D44 §6.1 sketch calls for postMessage
 * auto-height, but that requires a script inside the frame — impossible with `allow-scripts` OFF.
 * Shipping a postMessage listener that can NEVER fire would be a false-safe, so v1 uses a
 * caller-controlled `heightPx` (default a card height). Auto-height returns WITH the doored
 * `allow-scripts` flip for trusted cards (origin-checked listener), not before.
 *
 * Spec: UI-Theming §12.2 (D44) — the untrusted-HTML boundary.
 */
export function SandboxFrame({
  html,
  css,
  themeTokens,
  title,
  complete = true,
  heightPx = DEFAULT_HEIGHT_PX,
  className,
}: SandboxFrameProps): ReactElement {
  const style: CSSProperties = { height: `${heightPx}px` };

  if (!complete) {
    return (
      <div
        className="w-full animate-pulse rounded-card border border-border bg-muted"
        style={style}
        data-slot="sandbox-frame-skeleton"
        aria-hidden={true}
      />
    );
  }

  const srcDoc = buildSrcDoc({ html, css, themeTokens: clampSandboxThemeTokens(themeTokens) });
  return (
    <iframe
      // The load-bearing security attributes (D44 §12.2) — owned here + in srcdoc.ts.
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

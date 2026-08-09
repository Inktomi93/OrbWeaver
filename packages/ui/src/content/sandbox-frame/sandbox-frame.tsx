import { clampCardFrameFontFamily, clampCardFrameThemeTokens } from "@orb/kit/card-frame";
import type { CSSProperties, ReactElement } from "react";
import { buildSrcDoc, SANDBOX_ATTR } from "./srcdoc.ts";

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
   *  (fail closed). On the SRCDOC arm the EMBEDDING document's CSP must allow it too (an inherited policy);
   *  on the ROUTED arm the served response carries the whole verdict itself. */
  readonly allowExternalMedia?: boolean;
  /** The ROUTED delivery: a `/api/card-frame/<id>` URL minted server-side for these exact bytes. When present
   *  the frame loads that DOCUMENT, whose own response CSP is the policy (`@orb/kit/card-frame`) — the only
   *  arm where a per-character trust grant can widen `img-src`, because a `srcdoc` document inherits ours.
   *  Absent ⇒ the srcdoc FLOOR renders (a story/CT mount, an unresolved or failed mint): always safe, never
   *  wider than the app document. The two are never combined — `srcdoc` wins over `src` in the HTML spec, so
   *  emitting both would silently render the floor while claiming the door. */
  readonly src?: string;
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
 *
 * TWO DELIVERIES, one policy engine (`@orb/kit/card-frame`): `src` (routed — the response carries its own
 * CSP, including the `sandbox` directive that keeps a DIRECT navigation opaque-origin) or `srcdoc` (the
 * floor — inherits ours). The `sandbox=""` attribute is applied on BOTH: on the routed arm it is redundant
 * with the response's `sandbox` directive, and that redundancy is deliberate belt-and-suspenders (a
 * mis-wired route that lost its header must not become a same-origin frame).
 */
export function SandboxFrame({
  html,
  css,
  themeTokens,
  fontFamily,
  allowExternalMedia = false,
  src,
  title,
  complete = true,
  heightPx = DEFAULT_HEIGHT_PX,
  fill = false,
  className,
}: SandboxFrameProps): ReactElement {
  const style: CSSProperties | undefined = fill ? undefined : { height: `${heightPx}px` };

  if (!complete) {
    return (
      // The frame and its skeleton are GROUPED CONTENT inside the message bubble (the elevated island):
      // `rounded-base`, never the floating `card` step (density-pass-spec.md §2.1 D6).
      <div className="w-full animate-pulse rounded-base border border-border bg-muted" style={style} data-slot="sandbox-frame-skeleton" aria-hidden={true} />
    );
  }

  // EXACTLY ONE of the two delivery attributes is ever emitted — see the `src` prop doc.
  const delivery =
    src === undefined
      ? {
          srcDoc: buildSrcDoc({
            html,
            css,
            themeTokens: clampCardFrameThemeTokens(themeTokens),
            fontFamily: clampCardFrameFontFamily(fontFamily),
            allowExternalMedia,
          }),
        }
      : { src };
  return (
    <iframe
      sandbox={SANDBOX_ATTR}
      {...delivery}
      title={title}
      loading="lazy"
      referrerPolicy="no-referrer"
      className={className ?? "w-full rounded-base border border-border bg-card"}
      style={style}
      data-slot="sandbox-frame"
      // Which delivery won — the ONLY externally observable tell that a card got its own policy instead of
      // the inherited floor (the CSP itself lives on a response header / inside an opaque-origin document).
      data-delivery={src === undefined ? "srcdoc" : "routed"}
    />
  );
}

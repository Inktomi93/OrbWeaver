import type { ErrorInfo, ReactElement, ReactNode } from "react";
import { Component, useSyncExternalStore } from "react";
import { Streamdown } from "streamdown";
import { cn } from "#lib";
import { MARKDOWN_MATH_PLUGIN } from "./math";
import { MARKDOWN_MERMAID_OPTIONS } from "./mermaid";
import {
  MARKDOWN_REMARK_PLUGINS,
  TIER_A_UNTRUSTED_ELEMENTS,
  TRUSTED_ALLOWED_TAGS,
  TRUSTED_LITERAL_TAG_CONTENT,
  untrustedUrlTransform,
} from "./policy";
import { MARKDOWN_SHIKI_THEME } from "./shiki-theme";

const TRUSTS = ["trusted", "untrusted"] as const;
const MODES = ["static", "streaming"] as const;

// Large-block perf guard (#195, UI-Arch §"Large-code-block perf guard"): Streamdown's Shiki
// re-highlight can freeze the tab on a huge fenced block. Guarding per-block would mean re-parsing
// markdown ourselves to isolate the fence — re-deriving Streamdown's own parser, the thing this seal
// exists to avoid — so the guard is on the WHOLE input's length instead (in practice one huge block
// dominates a message's total length). Above the threshold, skip the Streamdown mount and fall back
// to a plain, scrollable, un-highlighted `<pre>` (readable, never hangs the tab).
const MAX_RENDER_LENGTH = 20_000;

// The streaming per-block fade (§6.3.1 credits the reveal fade to Streamdown). Word granularity — NOT
// char — because `useSmoothText` already paces the reveal by word cut-point in front of this seal;
// animating per-char here would double-animate the same reveal. `fadeIn` matches the calm cadence.
const STREAMING_ANIMATION = { animation: "fadeIn", sep: "word" } as const;

// ── prefers-reduced-motion ───────────────────────────────────────────────────────────────────────
// Streamdown checks reduced-motion for NOBODY (verified in the 2.5 source) — the seal owns it. Same
// matchMedia + useSyncExternalStore shape as charts/chart.tsx and stream/use-smooth-text.ts. FLAGGED:
// this is the 3rd copy of this exact hook; the §13.0 "3+ and changing together" litmus says extract to
// @orb/ui/lib, but that file is out of this task's disjoint set — tracked as follow-up #41, kept local
// here rather than reaching outside scope.
const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void): () => void {
  const mql = globalThis.matchMedia(REDUCED_MOTION_QUERY);
  mql.addEventListener("change", onChange);
  return (): void => mql.removeEventListener("change", onChange);
}

function getReducedMotionSnapshot(): boolean {
  return globalThis.matchMedia(REDUCED_MOTION_QUERY).matches;
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, getReducedMotionSnapshot);
}

export interface MarkdownProps {
  /**
   * `trusted` = our own AI output (Streamdown's permissive defaults — max functionality; the
   * `<speaker>` custom tag passes through as literal text). `untrusted` = D21 content (imported cards,
   * other users): the Tier-A element allowlist + the url gate (blocks javascript:/data:/off-allowlist
   * hosts) and NO custom-tag passthrough. Pick per the content's trust tier, never by convenience.
   */
  readonly trust: (typeof TRUSTS)[number];
  /**
   * `static` = a settled message (no incomplete-markdown repair effect, no reveal fade, no caret).
   * `streaming` = the live/ghost path: Streamdown's `parseIncompleteMarkdown` repair, the per-block
   * `fadeIn`, and a streaming caret all engage (all still respect reduced-motion). Required — the
   * caller MUST pick; there is no ambient default (Streamdown's own default is `streaming`, wrong for
   * settled canon).
   */
  readonly mode: (typeof MODES)[number];
  readonly children: string;
  readonly className?: string;
}

interface BoundaryProps {
  readonly children: ReactNode;
}
interface BoundaryState {
  readonly failed: boolean;
}

// Streamdown's lazy CodeBlock/Mermaid chunks can crash on a stale deploy hash (#343) — a class error
// boundary converts that white-screen into a graceful fallback (the one place a class is required;
// React error boundaries have no hook form). Owned inside the seam, not the call site.
class MarkdownErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  override componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Swallow — the fallback renders the raw text; nothing actionable at the call site.
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return <div className="text-body text-muted-foreground">Content failed to render.</div>;
    }
    return this.props.children;
  }
}

/**
 * `@orb/ui/markdown` — the ONE markdown renderer (seals Streamdown 2.5; UI-Gates §6.3/§11.6). It wires
 * Streamdown's FULL useful surface behind a 4-prop API: BOTH `mode`s (settled `static` + live
 * `streaming`), the token-sourced `shikiTheme` (fenced code tracks the app palette — the charts-seal
 * lesson), the KaTeX `math` + token-styled `mermaid` plugins, `controls` (copy/download/fullscreen —
 * Streamdown's default), `linkSafety` (its default external-link confirm), the streaming `caret`, and
 * the per-block `fadeIn` (reduced-motion-gated). Two trust policies (D44 §12.2): `trusted` for our AI
 * output (+ `<speaker>` literal passthrough), `untrusted` for cards/other users (element allowlist +
 * url gate). Streamdown runs rehype-sanitize + rehype-harden by default, so `<script>`/`on*`/`<style>`
 * are stripped under BOTH policies. GFM is re-pinned `{ singleTilde:false }` so `10~20°C` isn't struck
 * through. The lazy code/mermaid chunks are error-bounded; a pathologically large input falls back to
 * a plain `<pre>`.
 *
 * Usage:
 *   `<Markdown trust="trusted" mode="static">{message.body}</Markdown>`  (settled canon)
 *   `<Markdown trust="trusted" mode="streaming">{repaired}</Markdown>`   (live ghost / reasoning)
 */
export function Markdown({ trust, mode, children, className }: MarkdownProps): ReactElement {
  const reducedMotion = usePrefersReducedMotion();
  const untrusted = trust === "untrusted";
  // Animation is structurally inert in `static` mode anyway (Streamdown branches on it), but gate
  // explicitly so intent is legible and reduced-motion always wins.
  const animate = mode === "streaming" && !reducedMotion;

  if (children.length > MAX_RENDER_LENGTH) {
    return (
      <pre
        className={cn("max-h-[60cqh] overflow-auto whitespace-pre-wrap text-body", className)}
        data-slot="markdown-oversized"
      >
        {children}
      </pre>
    );
  }

  return (
    <MarkdownErrorBoundary>
      <Streamdown
        mode={mode}
        dir="auto"
        shikiTheme={MARKDOWN_SHIKI_THEME}
        remarkPlugins={MARKDOWN_REMARK_PLUGINS}
        mermaid={MARKDOWN_MERMAID_OPTIONS}
        plugins={{ math: MARKDOWN_MATH_PLUGIN }}
        // `controls` (copy/download/fullscreen), `lineNumbers`, `parseIncompleteMarkdown`, and
        // `linkSafety` are all left at Streamdown's own defaults (`true` / repair-on / confirm-on) —
        // deliberately not overridden; documented in the seal's option map.
        {...(className === undefined ? {} : { className })}
        {...(animate ? { isAnimating: true, animated: STREAMING_ANIMATION } : {})}
        {...(mode === "streaming" ? { caret: "block" as const } : {})}
        {...(untrusted
          ? { allowedElements: TIER_A_UNTRUSTED_ELEMENTS, urlTransform: untrustedUrlTransform }
          : {
              allowedTags: TRUSTED_ALLOWED_TAGS,
              literalTagContent: [...TRUSTED_LITERAL_TAG_CONTENT],
            })}
      >
        {children}
      </Streamdown>
    </MarkdownErrorBoundary>
  );
}

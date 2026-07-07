import type { ErrorInfo, ReactElement, ReactNode } from "react";
import { Component } from "react";
import { Streamdown } from "streamdown";
import { cn, usePrefersReducedMotion } from "#lib";
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
// Streamdown checks reduced-motion for NOBODY (verified in the 2.5 source) — the seal owns it, via
// the shared `usePrefersReducedMotion` (`#lib`; matchMedia + useSyncExternalStore, one home for the
// hook this file, charts/chart.tsx, and stream/use-smooth-text.ts all used to fork identically).

export interface MarkdownProps {
  /**
   * The render trust tier — **untrusted BY DEFAULT** (D21 / D44 §12.0). `untrusted` = the safe posture
   * for anything the box owner didn't author: LLM output (indirect prompt-injection can make the model
   * emit exfil-shaped markup — Claude-Artifacts treats its own model's HTML the same way), imported
   * cards, and other participants. It applies the Tier-A element allowlist + the url gate (blocks
   * javascript:/data:/off-allowlist hosts), drops the `<speaker>` custom-tag passthrough, AND withholds
   * Mermaid (see the render body). `trusted` is the EXPLICIT-OPT-IN escalation — the viewer's OWN input,
   * or a character/global that opted into rich HTML (the D44 `trustHtml` axis, resolved by the caller) —
   * and enables Streamdown's permissive defaults + the `<speaker>` literal passthrough. The boundary is
   * the caller's to resolve; NEVER pick `trusted` for convenience.
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
 * the per-block `fadeIn` (reduced-motion-gated). Two trust policies (D44 §12.0/§12.2), **untrusted by
 * default**: `untrusted` (LLM output / imported cards / other users) applies the Tier-A element
 * allowlist + url gate, drops the `<speaker>` passthrough, AND withholds Mermaid (#54 — see the render
 * body); `trusted` (the opt-in escalation) restores Streamdown's permissive defaults + `<speaker>`
 * literal passthrough. Streamdown runs rehype-sanitize + rehype-harden by default, so
 * `<script>`/`on*`/`<style>` are stripped under BOTH policies. GFM is re-pinned `{ singleTilde:false }`
 * so `10~20°C` isn't struck through. The lazy code/mermaid chunks are error-bounded; a pathologically
 * large input falls back to a plain `<pre>`.
 *
 * Usage:
 *   `<Markdown trust="untrusted" mode="static">{message.body}</Markdown>`  (settled canon — the default)
 *   `<Markdown trust="trusted" mode="streaming">{repaired}</Markdown>`     (own input / opted-in card)
 */
export function Markdown({ trust, mode, children, className }: MarkdownProps): ReactElement {
  const reducedMotion = usePrefersReducedMotion();
  const untrusted = trust === "untrusted";
  // GUARDRAIL (#54 / D44 §12.2): withhold Mermaid under `untrusted`. A ```mermaid fence renders arbitrary
  // diagram DSL through a heavy lazy engine (diagram-label injection + resource-abuse surface), so the
  // `mermaid` option is passed ONLY for `trusted` content; without it the fence degrades to an inert Shiki
  // code block. KaTeX (`math`) is kept for BOTH tiers — rehype-katex defaults `trust:false` (no
  // `\href`/`\includegraphics`, so no network/script vector), math-only and inert (KATEX_OPTIONS sets
  // only `errorColor`, never `trust`). Verified against Streamdown 2.5's `mermaid?: MermaidOptions` prop.
  const mermaidProp = untrusted ? {} : { mermaid: MARKDOWN_MERMAID_OPTIONS };
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

  // UIP-304: emphasis/italic (`*text*` → `<em>`) reads as NARRATION in this app's prose voice (ST
  // EmColor / D44 §12.1 narrationColor) — the base className tints every rendered `<em>` with
  // `--color-narration`. ONE home for the convention (re-themes for free; a per-speaker ThemeScope that
  // re-points `--color-narration` overrides it inline for a merged-narrator span).
  return (
    <MarkdownErrorBoundary>
      <Streamdown
        mode={mode}
        dir="auto"
        shikiTheme={MARKDOWN_SHIKI_THEME}
        remarkPlugins={MARKDOWN_REMARK_PLUGINS}
        plugins={{ math: MARKDOWN_MATH_PLUGIN }}
        {...mermaidProp}
        // Streamdown's incomplete-markdown REPAIR is a STREAMING concern (auto-close a dangling `*`/fence
        // mid-stream so it doesn't flash); a settled body is complete + must render as-authored. Gate it to
        // `streaming` explicitly (Streamdown's `mode` already gates the effect, so this is belt-and-braces
        // + legible intent). The ST-parity "auto-fix a settled body" pref lives at a DIFFERENT layer — the
        // client `fixMarkdown` pass (lib/message-render), NOT here. `controls`/`linkSafety` stay at defaults.
        parseIncompleteMarkdown={mode === "streaming"}
        className={cn("[&_em]:text-narration", className) ?? ""}
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

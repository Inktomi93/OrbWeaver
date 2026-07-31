import type { ErrorInfo, ReactElement, ReactNode } from "react";
import { Component } from "react";
import { Streamdown } from "streamdown";
import { cn, usePrefersReducedMotion } from "#lib";
import { DIALOGUE_COMPONENTS } from "./dialogue-paragraph";
import { MARKDOWN_MATH_PLUGIN } from "./math";
import { MARKDOWN_MERMAID_OPTIONS } from "./mermaid";
import { MARKDOWN_REMARK_PLUGINS, TIER_A_UNTRUSTED_ELEMENTS, TRUSTED_ALLOWED_TAGS, TRUSTED_LITERAL_TAG_CONTENT, untrustedUrlTransform } from "./policy";
import { MARKDOWN_SHIKI_PLUGIN } from "./shiki-plugin";

const TRUSTS = ["trusted", "untrusted"] as const;
const MODES = ["static", "streaming"] as const;

// Large-block perf guard: Streamdown's Shiki re-highlight can freeze the tab on a huge fenced
// block. Guarding on the whole input's length (not per-block, which would mean re-parsing markdown
// ourselves) — above the threshold, fall back to a plain, scrollable, un-highlighted <pre>.
const MAX_RENDER_LENGTH = 20_000;

// Word granularity, not char — useSmoothText already paces the reveal by word cut-point in front
// of this seal, so per-char here would double-animate the same reveal.
const STREAMING_ANIMATION = { animation: "fadeIn", sep: "word" } as const;

// Streamdown checks reduced-motion for nobody — this seal owns it via the shared usePrefersReducedMotion.

export interface MarkdownProps {
  /**
   * The render trust tier — untrusted by default. `untrusted` is the safe posture for anything the
   * box owner didn't author (LLM output, imported cards, other participants): the Tier-A element
   * allowlist + url gate, no `<speaker>` passthrough, and Mermaid withheld. `trusted` is the
   * explicit-opt-in escalation for the viewer's own input or an opted-in character/global — the
   * boundary is the caller's to resolve; never pick `trusted` for convenience.
   */
  readonly trust: (typeof TRUSTS)[number];
  /**
   * `static` = a settled message (no repair effect, no reveal fade, no caret). `streaming` = the
   * live/ghost path with Streamdown's `parseIncompleteMarkdown` repair, per-block fade, and caret.
   * Required — there is no ambient default (Streamdown's own default is `streaming`, wrong for settled canon).
   */
  readonly mode: (typeof MODES)[number];
  readonly children: string;
  readonly className?: string;
  /**
   * Opt-in quoted-speech tinting (`dialogue.ts` + `dialogue-paragraph.tsx`): wrap each closed `"…"` / `“…”` run in a
   * `--color-dialogue` span. OFF by default — this is CHAT prose grammar, not a property of markdown,
   * so a docs/panel surface never gets it; the chat message + ghost seals pass the user's
   * `appearance.colorQuotedSpeech` pref through.
   */
  readonly colorQuotes?: boolean;
}

interface BoundaryProps {
  readonly children: ReactNode;
}
interface BoundaryState {
  readonly failed: boolean;
}

// Streamdown's lazy CodeBlock/Mermaid chunks can crash on a stale deploy hash — a class error
// boundary converts that white-screen into a graceful fallback (React error boundaries have no hook form).
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
 * `@orb/ui/markdown` — the one markdown renderer, sealing Streamdown 2.5 behind a 4-prop API: both
 * `mode`s, the token-sourced Shiki `code` plugin, the KaTeX `math` + token-styled `mermaid`
 * plugins, `controls`, `linkSafety`, the streaming caret, and the per-block fade. Two trust
 * policies, untrusted by default: `untrusted` applies the Tier-A element allowlist + url gate,
 * drops `<speaker>`, and withholds Mermaid; `trusted` restores Streamdown's permissive defaults.
 * Streamdown runs rehype-sanitize + rehype-harden by default under both policies. A pathologically
 * large input falls back to a plain `<pre>`.
 */
export function Markdown({ trust, mode, children, className, colorQuotes = false }: MarkdownProps): ReactElement {
  const reducedMotion = usePrefersReducedMotion();
  const untrusted = trust === "untrusted";
  // Withhold Mermaid under untrusted: a ```mermaid fence renders arbitrary diagram DSL through a
  // heavy lazy engine (a resource-abuse surface), so it's passed only for trusted content. KaTeX
  // stays for both tiers — rehype-katex defaults trust:false, so it's math-only and inert.
  const mermaidProp = untrusted ? {} : { mermaid: MARKDOWN_MERMAID_OPTIONS };
  // Animation is structurally inert in static mode anyway, but gate explicitly so intent is legible.
  const animate = mode === "streaming" && !reducedMotion;

  if (children.length > MAX_RENDER_LENGTH) {
    return (
      <pre className={cn("max-h-[60cqh] overflow-auto whitespace-pre-wrap text-body", className)} data-slot="markdown-oversized">
        {children}
      </pre>
    );
  }

  // Emphasis/italic reads as narration in this app's prose voice — the base className tints every
  // rendered <em> with --color-narration, re-themed for free per palette.
  // Streamdown's root div HARDCODES its own spacing utilities (a 1rem block gap + whitespace-normal +
  // first/last-child margin trims) and twMerges our className over them. Its dist is deliberately NOT a
  // Tailwind source (its raw spacing would fight the reading-typography tokens —
  // `--reading-paragraph-spacing` owns prose spacing via the higher-specificity
  // `[data-slot="message-bubble"] p + p` rule), so those defaults were DEADCSS in the DOM. The base
  // className below neutralizes them with COMPILED equivalents: `space-y-0` replaces the 1rem gap via
  // the twMerge conflict group; the other three dedupe to the identical literal, which this scanned
  // source makes real. All four are visual no-ops (preflight zeroes margins) — the rendering is
  // byte-identical, minus the dead classes. (Don't spell the replaced gap utility here — Tailwind
  // scans comments, and the literal would resurrect it as an unused rule.)
  // `break-words` (overflow-wrap: break-word, inherited by every rendered block) is the ONE reading-surface
  // guard against a long unbroken token — a pasted URL/hash/run-on word — overflowing its column and
  // dragging a horizontal scrollbar onto the whole surface. Inert for normal prose (only breaks a word
  // that can't otherwise fit) and inert inside code fences (white-space:pre never wraps).
  return (
    <MarkdownErrorBoundary>
      <Streamdown
        mode={mode}
        dir="auto"
        remarkPlugins={MARKDOWN_REMARK_PLUGINS}
        plugins={{ code: MARKDOWN_SHIKI_PLUGIN, math: MARKDOWN_MATH_PLUGIN }}
        {...mermaidProp}
        // Incomplete-markdown repair is a streaming concern only; a settled body must render as-authored.
        parseIncompleteMarkdown={mode === "streaming"}
        // Omitted (not passed as undefined) when off: Streamdown's Block memo compares `components` key
        // by key, so a stable absent value keeps the settled render byte-identical to the pre-knob one.
        {...(colorQuotes ? { components: DIALOGUE_COMPONENTS } : {})}
        className={cn("space-y-0 whitespace-normal break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_em]:text-narration", className) ?? ""}
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

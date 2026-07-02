import type { ErrorInfo, ReactElement, ReactNode } from "react";
import { Component } from "react";
import { Streamdown } from "streamdown";
import { TIER_A_UNTRUSTED_ELEMENTS, untrustedUrlTransform } from "./policy";

const TRUSTS = ["trusted", "untrusted"] as const;

export interface MarkdownProps {
  /**
   * `trusted` = our own AI output (Streamdown defaults — max functionality). `untrusted` = D21
   * content (imported cards, other users): the Tier-A element allowlist + the url gate (blocks
   * javascript:/data:/off-allowlist hosts). Pick per the content's trust tier, never by convenience.
   */
  readonly trust: (typeof TRUSTS)[number];
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
 * `@orb/ui/markdown` — the ONE markdown renderer (seals Streamdown; UI-Gates §6.3/§11.6). Two trust
 * policies (D44 §12.2): `trusted` for our AI output, `untrusted` for cards/other users (element
 * allowlist + url gate). Streamdown runs rehype-sanitize + rehype-harden by default, so `<script>` /
 * `on*` / `<style>` are stripped under BOTH policies; `untrusted` additionally forbids everything
 * outside Tier-A and blocks unsafe/off-allowlist urls. The lazy code/mermaid chunks are error-bounded.
 *
 * Usage: `<Markdown trust="untrusted">{card.description}</Markdown>`.
 *
 * VERIFY-AT-BUILD (§11.6, deferred to chat markdown): re-pin `remark-gfm { singleTilde:false }` so
 * prose like `10~20°C` isn't struck through — requires adding remark-gfm as a direct dep to override
 * Streamdown's bundled default; tracked for the Phase-5 chat wave (the concern is display-cosmetic,
 * not a security property).
 */
export function Markdown({ trust, children, className }: MarkdownProps): ReactElement {
  const untrusted = trust === "untrusted";
  return (
    <MarkdownErrorBoundary>
      <Streamdown
        {...(className === undefined ? {} : { className })}
        {...(untrusted
          ? { allowedElements: TIER_A_UNTRUSTED_ELEMENTS, urlTransform: untrustedUrlTransform }
          : {})}
      >
        {children}
      </Streamdown>
    </MarkdownErrorBoundary>
  );
}

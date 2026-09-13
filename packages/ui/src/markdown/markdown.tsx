import type { ErrorInfo, ReactElement, ReactNode } from "react";
import { Component, useState } from "react";
import type { StreamdownProps } from "streamdown";
import { defaultRehypePlugins, Streamdown } from "streamdown";
import { cn, usePrefersReducedMotion } from "#lib";
import { DIALOGUE_COMPONENTS } from "./dialogue-paragraph.tsx";
import { MARKDOWN_LIST_COMPONENTS } from "./list-components.tsx";
import { MARKDOWN_MATH_PLUGIN } from "./math.ts";
import { MARKDOWN_MERMAID_OPTIONS } from "./mermaid.tsx";
import { MARKDOWN_REMARK_PLUGINS, TIER_A_UNTRUSTED_ELEMENTS, TRUSTED_ALLOWED_TAGS, TRUSTED_LITERAL_TAG_CONTENT, untrustedUrlTransform } from "./policy.ts";
import { createRevealPlugin } from "./reveal-plugin.ts";
import { MARKDOWN_RULE_COMPONENTS } from "./rule-component.tsx";
import { MARKDOWN_SHIKI_PLUGIN } from "./shiki-plugin.ts";
import { holdAmbiguousTail } from "./tail-hold.ts";

// The two stable `components` maps. Both are module-level constants because Streamdown's Block memo
// reference-compares the map key by key — a per-render object would re-render every settled block.
// The seal OWNS four elements now: the three list elements (#1085) and the thematic break (H19,
// `rule-component.tsx`) — every one a vendor `jsx` call with an uncompiled class string and no branch
// behind it, which is the test #1085 set for taking an element over rather than out-painting it.
const SEAL_COMPONENTS: NonNullable<StreamdownProps["components"]> = { ...MARKDOWN_LIST_COMPONENTS, ...MARKDOWN_RULE_COMPONENTS };
const SEAL_COMPONENTS_WITH_DIALOGUE: NonNullable<StreamdownProps["components"]> = { ...SEAL_COMPONENTS, ...DIALOGUE_COMPONENTS };

const TRUSTS = ["trusted", "untrusted"] as const;
const MODES = ["static", "streaming"] as const;

// Large-block perf guard: Streamdown's Shiki re-highlight can freeze the tab on a huge fenced
// block. Guarding on the whole input's length (not per-block, which would mean re-parsing markdown
// ourselves) — above the threshold, fall back to a plain, scrollable, un-highlighted <pre>.
const MAX_RENDER_LENGTH = 20_000;

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
  /** The RENDER INPUTS whose change makes a retry meaningful — see the reset note on the boundary. */
  readonly resetKeys: readonly unknown[];
}
interface BoundaryState {
  readonly failed: boolean;
}

// Streamdown's lazy CodeBlock/Mermaid chunks can crash on a stale deploy hash — a class error
// boundary converts that white-screen into a graceful fallback (React error boundaries have no hook form).
//
// AND IT RETRIES, because the boundary wraps ONE message's `<Streamdown>` for that message's whole life:
// a latched `failed` turned a single transient throw (a chunk that failed to load once mid-stream) into a
// permanently dead message — "Content failed to render." for the rest of the session, over content that
// renders fine. It resets when `resetKeys` change, which for the streaming path is the next delta and for
// a settled one is the next edit/swipe. NOT a `key` on the boundary: keying it on the body would remount
// the whole Streamdown subtree on every streamed delta, which is the cost the seal's stable-identity
// props (SEAL_COMPONENTS, revealPlugins) exist to avoid. A deterministic failure re-throws and latches
// again on the same commit — the fallback still holds; only the LATCH is gone.
class MarkdownErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  override state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  override componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Swallow — the fallback renders the raw text; nothing actionable at the call site.
  }

  override componentDidUpdate(prev: BoundaryProps): void {
    const changed = prev.resetKeys.length !== this.props.resetKeys.length || prev.resetKeys.some((key, i) => key !== this.props.resetKeys[i]);
    if (this.state.failed && changed) {
      this.setState({ failed: false });
    }
  }

  override render(): ReactNode {
    if (this.state.failed) {
      return <div className="text-body leading-body text-muted-foreground">Content failed to render.</div>;
    }
    return this.props.children;
  }
}

/**
 * `@orb/ui/markdown` — the one markdown renderer, sealing Streamdown 2.5 behind a 4-prop API: both
 * `mode`s, the token-sourced Shiki `code` plugin, the KaTeX `math` + token-styled `mermaid`
 * plugins, `controls`, `linkSafety`, and (#42) the seal-owned streamed-word reveal fade
 * (`reveal-plugin.ts` + the `[data-orb-reveal]` CSS in ui globals) with the seal-owned caret
 * (the client's `ghost-stream-body` scope — Streamdown's `caret`/`animated` props are deliberately
 * unused, see the render comments). Two trust policies, untrusted by default: `untrusted` applies
 * the Tier-A element allowlist + url gate, drops `<speaker>`, and withholds Mermaid; `trusted`
 * restores Streamdown's permissive defaults (and, having no streaming consumer, gets no reveal
 * fade — the `allowedTags` schema merge is identity-gated on the default rehype pipeline).
 * Streamdown runs rehype-sanitize + rehype-harden by default under both policies. A pathologically
 * large input falls back to a plain `<pre>`. Streaming input additionally passes the seal-owned M1
 * tail-hold pre-pass (`tail-hold.ts`) before Streamdown parses it.
 */
export function Markdown({ trust, mode, children, className, colorQuotes = false }: MarkdownProps): ReactElement {
  const reducedMotion = usePrefersReducedMotion();
  const untrusted = trust === "untrusted";
  // Withhold Mermaid under untrusted: a ```mermaid fence renders arbitrary diagram DSL through a
  // heavy lazy engine (a resource-abuse surface), so it's passed only for trusted content. KaTeX
  // stays for both tiers — rehype-katex defaults trust:false, so it's math-only and inert.
  const mermaidProp = untrusted ? {} : { mermaid: MARKDOWN_MERMAID_OPTIONS };
  // #42 word-reveal fade (docs/history/design/streaming-reveal-42.md): our reveal plugin replaces Streamdown's
  // `animated` arm (that knob was DEAD — its `streamdown/styles.css` was never imported — and its
  // duration-0 re-render machinery snaps every fade at this app's commit cadence). UNTRUSTED-streaming
  // only: passing a custom `rehypePlugins` array would defeat the identity-gated `allowedTags` schema
  // merge the TRUSTED tier depends on (policy.ts documents the gate), and no trusted surface streams
  // today. Reduced-motion (OS query) injects nothing at all — REMOVE, guide §3.9; the app-level
  // `[data-reduced-motion="true"]` floor additionally collapses the fade to instant in CSS.
  // One plugin instance per mount (its reveal-time log is the fade's memory), minted in a lazy
  // useState initializer: identity-stable for the component's whole life — Streamdown's Block memo
  // reference-compares `rehypePlugins`, so a fresh array per render would re-parse every settled
  // block — and mode-flip-safe (a reasoning block flips streaming→static mid-mount). The mint is a
  // closure + one array (no work happens until a streaming render passes it), so a static mount
  // paying it is cheaper than the ref-branch the react-hooks/refs render ban forbids.
  const reveal = mode === "streaming" && untrusted && !reducedMotion;
  const [revealPlugins] = useState<NonNullable<StreamdownProps["rehypePlugins"]>>(() => [
    ...Object.values(defaultRehypePlugins),
    createRevealPlugin().rehypePlugin,
  ]);
  const revealProp = reveal ? { rehypePlugins: revealPlugins } : {};

  // M1 tail-hold (tail-hold.ts, arm 1): streaming only, and a
  // pure PREFIX of the input — the still-undecidable trailing construct (a lone pipe row, a bare list
  // marker, a setext-underline candidate) is withheld for one commit so the tail paints as the block it
  // already is instead of flipping type under the reader. Runs before the repair layer; remend still sees
  // a well-formed prefix, and the caret keeps landing on a real leaf block (the pre-pass never empties
  // the body).
  const body = mode === "streaming" ? holdAmbiguousTail(children) : children;

  if (children.length > MAX_RENDER_LENGTH) {
    return (
      <pre
        // @orb-waive no-arbitrary-tw-values(max-h-[60cqh]): container-relative overflow cap has no token equivalent; ends when a cqh cap token exists.
        className={cn("relative max-h-[60cqh] overflow-auto overscroll-contain whitespace-pre-wrap text-body leading-body", className)}
        data-slot="markdown-oversized"
      >
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
  //
  // #238 — THE SAME RULING, PAID FORWARD TO THE DESCENDANTS THAT NEEDED IT. Not scanning the vendor dist
  // does not only drop spacing it was right to drop: Streamdown styles its BLOCKQUOTE and its inline CODE
  // with its own utilities too, and those generated nothing, so a blockquote rendered with
  // `border-left-width: 0 · padding-left: 0 · margin-top: 0` — italic + muted, which is byte-identical to
  // how this seal paints NARRATION (`[&_em]:text-narration`). Quoted content and the narrator's voice
  // became the same rendering, on a surface whose entire voice system is typographic. The fix is the
  // ruling's own technique, not its reversal: pay the difference in COMPILED equivalents from OUR source,
  // as descendant variants off this root, in house tokens (`--spacing-block`/`--spacing-row`,
  // `--color-muted-foreground`) rather than the vendor's raw rem values — which is why the dist stays
  // unscanned. The vertical separation is PADDING, not a margin: the root's own `space-y-0` (the trim
  // that replaced the vendor's 1rem block gap) out-specifies any sibling margin a descendant could set,
  // and padding also runs the rule the full height of the quote instead of leaving it floating.
  // Adding `@source "…/streamdown/dist"` would have resurrected the vendor's whole spacing scale app-wide,
  // the thing `--reading-paragraph-spacing` exists to own. Pinned by the two `#238:` cases in
  // tests/ui/markdown/markdown.ct.tsx (rendered geometry, not class strings).
  //
  // #490 — #238's INLINE-CODE HALF WAS ONLY HALF PAID. The paragraph above names inline code beside the
  // blockquote, but only the horizontal padding was ever compensated (`px-tight`). The vendor also spells
  // a SIZE and a VERTICAL padding on that element, and both were dropping on the floor: measured in a room
  // (side-eye 2026-08-22) an inline chip rendered at `fontSize 15px` (= body — its `text-sm` never
  // compiled) with `padding: 0px 4px` (its `py-0.5` never compiled) and an 18px box inside a 23.25px
  // line — a muted bar hugging the glyphs rather than the chip the design system draws everywhere else
  // (`font-mono text-code` is the house inline-code voice, kbd/tool-call/option-strip). Same technique,
  // same reason: `text-code` (13px, the token) and `py-tight` (4px, matching the `px-tight` already here),
  // never the vendor's `text-sm`/`0.125rem`.
  //
  // #1085 — THE SAME FAMILY'S THIRD AND WORST CASE, PAID A DIFFERENT WAY, ON PURPOSE. Streamdown's
  // list elements carry the same never-compiled utilities, and preflight zeroes list-style/margin/padding
  // on `ul`/`ol`, so every chat list rendered as flat unmarked text (owner-observed live). Here the seal
  // takes the ELEMENTS over (`components`, see `list-components.tsx` for the full ruling) instead of
  // out-painting them from this root: unlike the code element there is no vendor branch to re-implement,
  // and owning them means our tokens are the ONLY classes on the element rather than a compiled layer
  // over dead vendor residue. The unscanned-dist ruling is untouched — the values are house tokens.
  //
  // H19 — THE FAMILY'S FOURTH CASE (side-eye HOME 2026-09-02), taken the #1085 way. Streamdown's `hr` is
  // `cn("my-6 border-border", …)`, so a message containing `---` rendered `[css] dead class · .my-6` in
  // the transcript AND a rule flush against the prose on both sides (preflight zeroes margins). Owned, for
  // the #1085 test: one vendor `jsx` call, no branch behind it, so owning it removes the dead class from
  // the DOM rather than out-painting it. Its spacing is the descendant variant above, and
  // `rule-component.tsx` states why that one is a margin where the blockquote's is padding.
  //
  // WHAT THIS DOES *NOT* DO: it does not move `snap --deadcss`, which still reports the vendor's three
  // uncompiled literals (`text-sm`/`py-0.5`/`px-1.5`) because they stay in the class attribute — the
  // element is Streamdown's, and taking it over would mean re-implementing its whole fenced-code branch
  // (Shiki plugin dispatch, mermaid, the control cluster) to own one inline span. Those three are the
  // ruled-and-permanent cost of the unscanned dist, not a defect: the RENDER is what this fixes.
  //
  // `break-words` (overflow-wrap: break-word, inherited by every rendered block) is the ONE reading-surface
  // guard against a long unbroken token — a pasted URL/hash/run-on word — overflowing its column and
  // dragging a horizontal scrollbar onto the whole surface. Inert for normal prose (only breaks a word
  // that can't otherwise fit) and inert inside code fences (white-space:pre never wraps).
  return (
    <MarkdownErrorBoundary resetKeys={[body, mode, trust]}>
      <Streamdown
        mode={mode}
        dir="auto"
        remarkPlugins={MARKDOWN_REMARK_PLUGINS}
        plugins={{ code: MARKDOWN_SHIKI_PLUGIN, math: MARKDOWN_MATH_PLUGIN }}
        {...mermaidProp}
        // Incomplete-markdown repair is a streaming concern only; a settled body must render as-authored.
        parseIncompleteMarkdown={mode === "streaming"}
        // ALWAYS passed since #1085 — the seal owns the three list elements (`list-components.tsx`) and,
        // since H19, the thematic break (`rule-component.tsx`); the dialogue paragraph joins that map
        // rather than replacing it. Both arms are module-level constants: Streamdown's Block memo compares
        // `components` key by key, so a stable identity is what keeps a settled block from re-rendering on
        // every commit.
        components={colorQuotes ? SEAL_COMPONENTS_WITH_DIALOGUE : SEAL_COMPONENTS}
        className={
          cn(
            "space-y-0 whitespace-normal break-words [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_em]:text-narration",
            "[&_blockquote]:border-l-4 [&_blockquote]:border-muted-foreground/50 [&_blockquote]:py-row [&_blockquote]:pl-block",
            // The thematic break's SEPARATION (H19). The element itself is ours now (`rule-component.tsx`
            // owns its ink), but the gap is spelled HERE, as a descendant variant, for the same reason the
            // blockquote's is: the root's own `space-y-0` trim governs a direct child's block margins, and
            // a rule is the one owned element whose separation cannot be padding (preflight draws the line
            // as its border-top, so padding puts the whole gap on one side of it). House token, never the
            // vendor's `my-6`.
            "[&_hr]:my-row",
            // @orb-waive integer-line-boxes(text-code): inline code INSIDE prose — the line's box is the surrounding paragraph's strut (a smaller inline box never grows an integer line), so pairing a leading here would be inert. Ends if this selector stops targeting inline (non-pre) code.
            "[&_:not(pre)>code]:px-tight [&_:not(pre)>code]:py-tight [&_:not(pre)>code]:text-code",
            className,
          ) ?? ""
        }
        // The word-reveal fade + the caret are OURS (#42): `animated`/`isAnimating` are deliberately NOT
        // passed (dead knob, see above — and their absence routes streaming block updates through
        // Streamdown's useTransition arm), and the `caret` prop is dropped because its `::after` attaches
        // to the per-block `dir` wrapper and renders on a fresh line below the text; the client ghost's
        // `ghost-stream-body` scope paints the caret on the true leaf block instead.
        {...revealProp}
        {...(untrusted
          ? { allowedElements: TIER_A_UNTRUSTED_ELEMENTS, urlTransform: untrustedUrlTransform }
          : {
              allowedTags: TRUSTED_ALLOWED_TAGS,
              literalTagContent: [...TRUSTED_LITERAL_TAG_CONTENT],
            })}
      >
        {body}
      </Streamdown>
    </MarkdownErrorBoundary>
  );
}

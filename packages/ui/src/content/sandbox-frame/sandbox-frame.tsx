import { CARD_FRAME_SANDBOX, clampCardFrameFontFamily, clampCardFrameThemeTokens, foldCardFrameHeight } from "@orb/kit/card-frame";
import type { CSSProperties, ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { buildSrcDoc } from "./srcdoc.ts";

// The PRE-MEASUREMENT height, and the only height the srcdoc floor ever has (that arm is script-dead, so it
// cannot report its own size). On the routed arm this is what paints until the frame's one hash-pinned
// script answers — a floor for the first frame, not the final size.
const DEFAULT_HEIGHT_PX = 320;

// An iframe is a focusable landmark in the tab order, so its `title` IS its accessible name — an empty one
// announces as an unnamed frame. The single production caller (`ImmersiveCard`) always passes the card's
// own title (falling back to its own untitled label), so this constant is the LIBRARY floor for a caller
// that hands us an empty string, not a second naming policy.
const UNNAMED_FRAME_TITLE = "Embedded card";

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
  /** The frame's ACCESSIBLE NAME (an iframe is focusable, and `title` is what a screen reader announces).
   *  Callers pass the card's own title; an empty string falls back to a generic label rather than shipping
   *  an unnamed frame into the tab order. */
  readonly title: string;
  /** While false, a skeleton renders instead of the frame — a half-rendered flash is worse than a code fence. */
  readonly complete?: boolean;
  /** The PRE-MEASUREMENT height. On the routed arm the frame's own hash-pinned script reports its content
   *  height and that wins (clamped + grow-only, `@orb/kit/card-frame`); on the script-dead srcdoc floor this
   *  is the final height. Not a minimum: the whole point of #91 is that a short card measures BELOW it. */
  readonly heightPx?: number;
  /** Fill the parent instead of the fixed `heightPx` — the expanded/lightbox arm (the parent owns height). */
  readonly fill?: boolean;
  readonly className?: string;
  /**
   * An AUTHENTICATED message from the framed document — called for every `message` event whose sender is THIS
   * frame's own window, AFTER the height fold, with the raw `event.data` and a `reply` closure that posts back
   * to the frame. `undefined` (the card arm) means the frame speaks only its height and nothing listens for more.
   *
   * The window-identity check (`event.source === contentWindow`) lives HERE, in the sealed painter that owns the
   * iframe ref, because it is the one authentication this channel can perform: every sandboxed document reports
   * `event.origin === "null"`, so origin cannot tell OUR frame from any other opaque sender on the page. What the
   * message MEANS is the caller's to decide — this component proves only WHO sent it. So the plugin bridge (U7)
   * passes this to relay host calls, while the PARSE of those calls stays in the feature (`@orb/ui` cannot import
   * `@orb/contracts`). One home for the identity rule; the meaning stays with the consumer.
   */
  readonly onHostMessage?: (data: unknown, reply: (message: unknown) => void) => void;
}

/**
 * Renders untrusted self-contained HTML/CSS inside a sandboxed iframe. The iframe IS the security
 * boundary: no `allow-same-origin` on either delivery (null origin — no cookies, no storage, no reach into
 * the app's DOM) and a per-frame CSP that names no `connect-src`, so a card can never fetch or phone home.
 *
 * TWO DELIVERIES, one policy engine (`@orb/kit/card-frame`), and the sandbox grant is now PER DELIVERY
 * (`CARD_FRAME_SANDBOX`, which owns the review): `src` (routed — the response carries its own CSP,
 * including the `sandbox` directive that keeps a DIRECT navigation opaque-origin, plus the `script-src`
 * whose sources the server picked per POSTURE) or `srcdoc` (the floor — inherits ours, sandbox `""`,
 * script-dead). Applying the attribute on the routed arm as well as the response's `sandbox` directive is
 * deliberate belt-and-suspenders: a mis-wired route that lost its header must not become a same-origin
 * frame — and since #111 leg 3 that belt is load-bearing rather than theoretical, because a routed card on
 * the `interactive` posture RUNS ITS OWN SCRIPTS (`script-src 'unsafe-inline'`, granted only when the host
 * opted this character in AND the deployment's `allowInteractiveCards` ceiling is up). Nothing about which
 * posture a document got is decided or even visible here: the server built the policy, this side just
 * frames the URL.
 *
 * HEIGHT: caller-controlled until the routed frame measures itself. The message is untrusted input from a
 * hostile document and is treated as such — see the listener below.
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
  onHostMessage,
}: SandboxFrameProps): ReactElement {
  const frameRef = useRef<HTMLIFrameElement>(null);
  // The measurement is stored WITH the delivery it belongs to, so a re-mint (new `src`) is answered during
  // render instead of by a cascading `setState` — the same shape `useCardFrameSrc` uses for its handle.
  const [measured, setMeasured] = useState<{ readonly delivery: string; readonly px: number } | undefined>(undefined);
  const deliveryKey = src ?? "srcdoc-floor";

  // The frame's self-reported height crosses a TRUST BOUNDARY: the document that sends it renders
  // model-authored markup. Two independent checks, neither of which trusts the message's contents:
  //   1. SENDER — `event.source` must be this frame's own window. Origin cannot do this job: every
  //      sandboxed document (ours, another card's, an ad iframe) reports `event.origin === "null"`, so an
  //      origin check would accept any opaque frame on the page. Window identity names exactly one sender,
  //      which is what keeps an INTERACTIVE card (#111 leg 3 — it can `postMessage` anything, including to
  //      its siblings, measured) from resizing any frame but its own.
  //   2. PAYLOAD — `foldCardFrameHeight` coerces, clamps to floor..cap and refuses a shrink (kit, tested).
  // Listener registration follows the delivery, because a re-mint replaces the frame's window.
  useEffect(() => {
    if (fill) {
      return;
    }
    const onMessage = (event: MessageEvent): void => {
      const frameWindow = frameRef.current?.contentWindow;
      if (event.source === null || event.source !== frameWindow) {
        return;
      }
      setMeasured((current) => {
        const px = foldCardFrameHeight(current?.delivery === deliveryKey ? current.px : undefined, event.data);
        return px === undefined ? current : { delivery: deliveryKey, px };
      });
      // The sender is proven to be THIS frame's window (`frameWindow` is non-null here — the guard above
      // returned otherwise); the consumer decides what the message means. `reply` targets that same window
      // (`"*"` because an opaque-origin document has no origin to name — the message still reaches exactly the
      // one window handle captured here).
      onHostMessage?.(event.data, (message) => frameWindow.postMessage(message, "*"));
    };
    window.addEventListener("message", onMessage);
    return (): void => {
      window.removeEventListener("message", onMessage);
    };
  }, [fill, deliveryKey, onHostMessage]);

  // `fill` = the lightbox arm, where the PARENT owns height and a self-report must not participate.
  const appliedPx = (measured?.delivery === deliveryKey ? measured.px : undefined) ?? heightPx;
  const style: CSSProperties | undefined = fill ? undefined : { height: `${appliedPx}px` };

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
      // A DELIVERY FLIP MUST REMOUNT (measured live 2026-08-15): Chromium does not re-process `src` when
      // `srcdoc` is removed from an already-committed frame — flipping the floor to the routed arm on ONE
      // element leaves the frame parked at about:blank forever (an opaque sandboxed blank paints WHITE, so
      // every routed card rendered as a white void). Keying by delivery mounts a fresh element whose `src`
      // is present at insertion, which navigates. srcdoc-arm content changes stay in-place diffs (reliable).
      key={deliveryKey}
      ref={frameRef}
      sandbox={CARD_FRAME_SANDBOX[src === undefined ? "meta" : "document"]}
      {...delivery}
      title={title === "" ? UNNAMED_FRAME_TITLE : title}
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

import type { CardFrameHeight, CardFrameHeightCap } from "@orb/kit/card-frame";
import {
  CARD_FRAME_SANDBOX,
  cardFrameSettleDelayMs,
  clampCardFrameFontFamily,
  clampCardFrameStyleTokens,
  clampCardFrameThemeTokens,
  foldCardFrameHeight,
  readCardFrameLink,
  readCardFrameMissing,
  settleCardFrameHeight,
} from "@orb/kit/card-frame";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { cn } from "#lib";
import { cssVar } from "#tokens";
import { gateFrameFocus, holdsAdmittedFocus } from "./frame-focus.ts";
import { buildSrcDoc } from "./srcdoc.ts";

// An iframe is a focusable landmark in the tab order, so its `title` IS its accessible name — an empty one
// announces as an unnamed frame. The single production caller (`ImmersiveCard`) always passes the card's
// own title (falling back to its own untitled label), so this constant is the LIBRARY floor for a caller
// that hands us an empty string, not a second naming policy.
// A card frame is grouped content on its own surface; a reply frame is the bubble's own prose and paints none.
const FRAME_SURFACE: Record<CardFrameHeightCap, string> = { card: "rounded-base border border-border bg-card inline-full", reply: "inline-full" };

const UNNAMED_FRAME_TITLE = "Embedded card";

// How long a veiled routed frame may stay silent after its document loads. The pinned script reports on load, so a
// document still silent past this answered with an error status, or carries no script the policy let run.
const FRAME_REPORT_BOUND_MS = 2000;

// Whether a vetted framed link points off the app's own origin. An address the URL parser refuses leaves nothing.
function leavesApp(link: string): boolean {
  const url = URL.parse(link);
  return url !== null && url.origin !== location.origin;
}

interface SandboxFramePropsBase {
  /** The untrusted HTML — handed to a sandboxed realm, NEVER sanitized into the main DOM. */
  readonly html: string;
  /** Optional card CSS (rides the sandboxed document's own `<style>`; cannot touch the app). */
  readonly css?: string;
  /** Re-clamped at this boundary via `isSafeColor` regardless of caller. */
  readonly themeTokens?: Readonly<Record<string, string>>;
  /** The NON-COLOR `--*` slice (radius, mono family) — re-clamped at this boundary by the kit style grammar,
   *  which `isSafeColor` structurally cannot judge (#799). */
  readonly styleTokens?: Readonly<Record<string, string>>;
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
  /** What the frame holds: one card (the default), drawn on its own bordered surface under the card height cap, or
   *  one whole reply, which sits on its bubble's surface and grows to its content instead of scrolling inside itself
   *  (`@orb/kit/card-frame`). */
  readonly holds?: CardFrameHeightCap;
  /**
   * A link clicked inside the frame, as an absolute http, https or mailto address off the app's own origin. Called
   * only when the sender is this frame's own window ({@link readCardFrameLink} vets the address), the page holds a
   * live user activation AND the focus gate admitted this frame as the place the reader holds
   * ({@link holdsAdmittedFocus}): after a press on it or a Tab into it, never after its own `focus()`. So a scripted
   * frame raises nothing off a click elsewhere in the app; once the reader presses or types in it, its script can post
   * on that input. A frame with `ungatedFocus` is never admitted and never raises it. The string is the frame's: the
   * caller still owes its own parse and confirm before opening. Absent ⇒ a framed link does nothing.
   */
  readonly onLink?: (url: string) => void;
  /** The frame's document is the server's miss notice: its handle is unknown, expired or evicted. Sender-checked
   *  like every frame message; the caller may mint again. */
  readonly onMissing?: () => void;
  /**
   * Leave focus into the frame ungated. A card or reply frame is gated ({@link gateFrameFocus}): focus enters it only by
   * a click on it or a Tab from the app. A plugin surface passes this: it is the app's own installed surface, opened by
   * a click in the app, and its controls take focus at once as the app's do. Only its load-time focus is returned.
   */
  readonly ungatedFocus?: boolean;
  /** The frame fell to the script-dead floor for good and draws `html` there; a caller whose `html` is empty draws its
   *  own. A gated frame falls when its own script took focus in a grab loop ({@link FRAME_FOCUS_GRAB_LOOP_BOUND}); a
   *  veiled routed frame falls when its document loads and reports no height within {@link FRAME_REPORT_BOUND_MS}. */
  readonly onFloor?: () => void;
}

export type SandboxFrameProps = SandboxFramePropsBase &
  (
    | {
        /** The PRE-MEASUREMENT height. On the routed arm the frame's own hash-pinned script reports its content
         *  height and that wins (clamped + grow-only, `@orb/kit/card-frame`); on the script-dead srcdoc floor this
         *  is the final height. Not a minimum: the whole point of #91 is that a short card measures BELOW it. */
        readonly heightPx?: number;
        readonly fill?: false;
        /**
         * What shows in the routed frame's place until its document reports its first height. Until then the frame
         * loads with no height, no paint and no focus, so the reader never sees a blank frame while its document
         * loads and draws. Absent ⇒ the frame shows from its first byte at `heightPx`.
         */
        readonly pending?: ReactNode;
      }
    | {
        readonly heightPx?: never;
        /** Fill the parent instead of the fixed `heightPx` — the expanded/lightbox arm (the parent owns height). */
        readonly fill?: boolean;
        readonly pending?: never;
      }
  );

// The frame's height: none while it is veiled, its measured or given height, or the chart height when it has neither.
// `fill` = the lightbox arm, where the PARENT owns height and a self-report must not participate.
function frameStyle(fill: boolean, veiled: boolean, appliedPx: number | undefined): CSSProperties | undefined {
  if (fill) {
    return undefined;
  }
  if (veiled) {
    return { height: 0 };
  }
  return { height: appliedPx === undefined ? cssVar("height.chart") : `${appliedPx}px` };
}

// EXACTLY ONE of the two delivery attributes is ever emitted — see the `src` prop doc.
function frameDelivery(input: {
  readonly html: string;
  readonly css: string | undefined;
  readonly themeTokens: Readonly<Record<string, string>> | undefined;
  readonly styleTokens: Readonly<Record<string, string>> | undefined;
  readonly fontFamily: string | undefined;
  readonly allowExternalMedia: boolean;
  readonly src: string | undefined;
}): { readonly srcDoc: string } | { readonly src: string } {
  if (input.src !== undefined) {
    return { src: input.src };
  }
  return {
    srcDoc: buildSrcDoc({
      html: input.html,
      css: input.css,
      themeTokens: clampCardFrameThemeTokens(input.themeTokens),
      styleTokens: clampCardFrameStyleTokens(input.styleTokens),
      fontFamily: clampCardFrameFontFamily(input.fontFamily),
      // A whole reply frames only on the routed delivery; the floor serves cards, which bring their own look.
      rootAttributes: undefined,
      allowExternalMedia: input.allowExternalMedia,
    }),
  };
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
 * the `interactive` posture RUNS ITS OWN SCRIPTS (`script-src 'unsafe-inline'`, granted when the character
 * resolves to the ladder's top rung, its default under the deployment's `allowInteractiveCards` ceiling,
 * and only while that ceiling is up). Nothing about which
 * posture a document got is decided or even visible here: the server built the policy, this side just
 * frames the URL.
 *
 * HEIGHT: caller-controlled until the routed frame measures itself. The message is untrusted input from a
 * hostile document and is treated as such — see the listener below.
 *
 * LINKS: a link message counts only from a frame the focus gate admitted (`onLink`). Raw `document.activeElement` is
 * not that control: a frame that calls `focus()` holds focus until the gate's judgement in the next task returns it.
 */
export function SandboxFrame({
  html,
  css,
  themeTokens,
  styleTokens,
  fontFamily,
  allowExternalMedia = false,
  src: routedSrc,
  title,
  complete = true,
  heightPx,
  fill = false,
  className,
  onHostMessage,
  holds = "card",
  onLink,
  onMissing,
  pending,
  ungatedFocus = false,
  onFloor,
}: SandboxFrameProps): ReactElement {
  const frameRef = useRef<HTMLIFrameElement>(null);
  // The measurement is stored WITH the delivery it belongs to, so a re-mint (new `src`) is answered during
  // render instead of by a cascading `setState` — the same shape `useCardFrame` uses for its handle.
  const [measured, setMeasured] = useState<{ readonly delivery: string; readonly height: CardFrameHeight } | undefined>(undefined);
  // Set once the frame falls to the floor (`onFloor`), with the height it had: it stays there.
  const [stopped, setStopped] = useState<{ readonly px: number | undefined } | undefined>(undefined);
  const src = stopped === undefined ? routedSrc : undefined;
  const deliveryKey = src ?? "srcdoc-floor";

  // The frame's self-reported height crosses a TRUST BOUNDARY: the document that sends it renders
  // model-authored markup. Two independent checks, neither of which trusts the message's contents:
  //   1. SENDER — `event.source` must be this frame's own window. Origin cannot do this job: every
  //      sandboxed document (ours, another card's, an ad iframe) reports `event.origin === "null"`, so an
  //      origin check would accept any opaque frame on the page. Window identity names exactly one sender,
  //      which is what keeps an INTERACTIVE card (#111 leg 3 — it can `postMessage` anything, including to
  //      its siblings, measured) from resizing any frame but its own.
  //   2. PAYLOAD — `foldCardFrameHeight` coerces, clamps to floor..cap and rations resizes (kit, tested).
  // Listener registration follows the delivery, because a re-mint replaces the frame's window. A `fill` frame's parent
  // owns its height, so it folds no height; its links and its miss notice pass the same checks as any frame's.
  useEffect(() => {
    const onMessage = (event: MessageEvent): void => {
      const frameWindow = frameRef.current?.contentWindow;
      if (event.source === null || event.source !== frameWindow) {
        return;
      }
      const nowMs = performance.now();
      if (!fill) {
        setMeasured((current) => {
          const height = foldCardFrameHeight(current?.delivery === deliveryKey ? current.height : undefined, event.data, holds, nowMs);
          return height === undefined ? current : { delivery: deliveryKey, height };
        });
      }
      const link = readCardFrameLink(event.data);
      // A link counts only from a press or key IN THIS FRAME: it activated the page (activation reaches every ancestor
      // of the frame it lands in) and the focus gate admitted this frame. Activation alone is page-wide and lasts
      // seconds, and a frame that posts and then calls `focus()` holds focus before the gate returns it, so either check
      // alone lets a scripted frame ride a click anywhere in the app. No activation API ⇒ no link. A link to the app's
      // own origin never leaves a frame: the frame resolves `href`, so `/settings` arrives as this origin.
      const frame = frameRef.current;
      if (
        link !== undefined &&
        frame !== null &&
        "userActivation" in navigator &&
        navigator.userActivation.isActive &&
        holdsAdmittedFocus(frame) &&
        leavesApp(link)
      ) {
        onLink?.(link);
      }
      if (readCardFrameMissing(event.data)) {
        onMissing?.();
      }
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
  }, [fill, deliveryKey, onHostMessage, holds, onLink, onMissing]);

  // A height the frame asked for while it had no resize credit lands when a credit comes back, so the last report a
  // document sends is always applied, even when it sends nothing after it.
  const waiting = measured?.delivery === deliveryKey ? measured.height : undefined;
  useEffect(() => {
    if (waiting === undefined) {
      return;
    }
    const delayMs = cardFrameSettleDelayMs(waiting, performance.now());
    if (delayMs === undefined) {
      return;
    }
    const timer = setTimeout(() => {
      setMeasured((current) =>
        current?.delivery === deliveryKey ? { delivery: deliveryKey, height: settleCardFrameHeight(current.height, performance.now()) } : current,
      );
    }, delayMs);
    return (): void => {
      clearTimeout(timer);
    };
  }, [waiting, deliveryKey]);

  // NO FOCUS ON MOUNT, for an ungated frame (a gated one is covered whole by its gate). A framed document that focuses
  // itself while it loads would pull the page's keyboard focus into a third party's document every time the frame
  // mounts, so if the frame holds focus when it finishes loading, focus returns to wherever it last was outside it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: deliveryKey + complete are the re-arm triggers — the iframe is re-keyed per delivery and absent while incomplete, so the ref's target changes with them.
  useEffect(() => {
    const frame = frameRef.current;
    if (frame === null || !ungatedFocus) {
      return;
    }
    let outside: Element | null = document.activeElement === frame ? null : document.activeElement;
    const onFocusIn = (event: FocusEvent): void => {
      if (event.target instanceof Element && event.target !== frame) {
        outside = event.target;
      }
    };
    const onLoad = (): void => {
      document.removeEventListener("focusin", onFocusIn);
      if (document.activeElement !== frame) {
        return;
      }
      if (outside instanceof HTMLElement && outside !== document.body && outside.isConnected) {
        outside.focus({ preventScroll: true });
      } else {
        frame.blur();
      }
    };
    document.addEventListener("focusin", onFocusIn);
    frame.addEventListener("load", onLoad, { once: true });
    return (): void => {
      document.removeEventListener("focusin", onFocusIn);
      frame.removeEventListener("load", onLoad);
    };
  }, [deliveryKey, complete, ungatedFocus]);

  const drawnPx = measured?.delivery === deliveryKey ? measured.height.px : undefined;
  const appliedPx = drawnPx ?? stopped?.px ?? heightPx;
  // Only the routed document measures itself; the srcdoc floor is script-dead, so it never waits.
  const veiled = pending !== undefined && src !== undefined && drawnPx === undefined;
  const style = frameStyle(fill, veiled, appliedPx);

  // FOCUS ENTERS ONLY BY THE READER'S HAND (`frame-focus.ts`): a frame's own script cannot take keyboard focus.
  const isVeiled = useEffectEvent((): boolean => veiled);
  const fallToFloor = useEffectEvent((): void => {
    if (stopped === undefined) {
      setStopped({ px: appliedPx });
      onFloor?.();
    }
  });
  // A veiled frame whose document loaded and stayed silent would hold its stand-in for good.
  // biome-ignore lint/correctness/useExhaustiveDependencies: deliveryKey + complete are the re-arm triggers — the iframe is re-keyed per delivery and absent while incomplete, so the ref's target changes with them.
  useEffect(() => {
    const frame = frameRef.current;
    if (frame === null || !isVeiled()) {
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onLoad = (): void => {
      timer = setTimeout(() => {
        if (isVeiled()) {
          fallToFloor();
        }
      }, FRAME_REPORT_BOUND_MS);
    };
    frame.addEventListener("load", onLoad);
    return (): void => {
      frame.removeEventListener("load", onLoad);
      clearTimeout(timer);
    };
  }, [deliveryKey, complete]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: deliveryKey + complete are the re-arm triggers — the iframe is re-keyed per delivery and absent while incomplete, so the ref's target changes with them.
  useEffect(() => {
    const frame = frameRef.current;
    if (frame === null || ungatedFocus) {
      return;
    }
    return gateFrameFocus(frame, isVeiled, fallToFloor);
  }, [deliveryKey, complete, ungatedFocus]);

  if (!complete) {
    return (
      // The frame and its skeleton are GROUPED CONTENT inside the message bubble (the elevated island):
      // `rounded-base`, never the floating `card` step (UI-Density-Law.md §2.1 D6).
      <div
        className="animate-pulse rounded-base border border-border bg-muted inline-full"
        style={style}
        data-slot="sandbox-frame-skeleton"
        aria-hidden={true}
      />
    );
  }

  const delivery = frameDelivery({ html, css, themeTokens, styleTokens, fontFamily, allowExternalMedia, src });
  return (
    <>
      {veiled ? pending : null}
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
        className={cn(className ?? FRAME_SURFACE[holds], veiled && "invisible")}
        style={style}
        inert={veiled}
        aria-hidden={veiled ? true : undefined}
        data-slot="sandbox-frame"
        // Which delivery won — the ONLY externally observable tell that a card got its own policy instead of
        // the inherited floor (the CSP itself lives on a response header / inside an opaque-origin document).
        data-delivery={src === undefined ? "srcdoc" : "routed"}
        data-drawn={veiled ? undefined : ""}
      />
    </>
  );
}

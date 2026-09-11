import type { CSSProperties, ReactElement } from "react";
import { useState } from "react";
import { cn } from "#lib";

// asset = our own origin (render freely); external = untrusted URL.
export type MediaSource = { readonly kind: "asset"; readonly url: string } | { readonly kind: "external"; readonly url: string };

export interface MessageMediaProps {
  readonly src: MediaSource;
  readonly media: "image" | "audio" | "video";
  readonly alt: string;
  /** Intrinsic size — reserves the aspect box so a late-arriving image doesn't shift layout. */
  readonly dims?: { readonly w: number; readonly h: number };
  /** Whether an EXTERNAL url may load; default false gates it behind a click-to-load placeholder (no network request until opt-in). Ignored for `asset` sources. */
  readonly allowExternal?: boolean;
  readonly className?: string;
  /** Click handler (e.g. open a lightbox) — images/video only. */
  readonly onActivate?: () => void;
}

// The reserved aspect for media with no known dims — space without a network probe. The `auto` keyword is
// load-bearing, not decoration: `aspect-ratio: auto <ratio>` on a REPLACED element (img/video) means "use the
// ratio until the natural one is known, then defer to the natural one". A bare `16 / 9` overrides the
// intrinsic ratio FOREVER, and the default `object-fit: fill` then stretches the pixels — a 1024×1536 portrait
// painted at 16:9 is a 2.66× distortion (#622). Non-replaced elements (the gate/broken/blocked fallbacks
// below) have no natural ratio, so `auto` is inert there and the reservation still holds.
const PLACEHOLDER_ASPECT = "auto 16 / 9";

// A data: URI carries NO network request to gate, so the click-to-load placeholder can't withhold
// anything — reject it outright, before it ever reaches `<img src>`/`<source src>`.
const DATA_URI = /^data:/iu;

function isDataUri(url: string): boolean {
  return DATA_URI.test(url.trim());
}

function hostOf(url: string): string {
  // @orb-waive caught-failure-ownership(catch): display-only fallback — a malformed url yields
  // the human-readable "external source" label, consumed directly as UI text. Ends if the fallback string
  // is removed.
  try {
    return new URL(url).host;
  } catch {
    return "external source";
  }
}

/**
 * Renders an image / native audio / video with the external-load gate. Untrusted A/V is always
 * `controls` and never `autoplay` (non-overridable — an autoplaying untrusted element is a tracking beacon).
 */
export function MessageMedia({ src, media, alt, dims, allowExternal = false, className, onActivate }: MessageMediaProps): ReactElement {
  const isExternal = src.kind === "external";
  const blockedDataUri = isExternal && isDataUri(src.url);
  const mediaIdentity = `${src.kind}:${media}:${src.url}`;
  const [loadRequestedFor, setLoadRequestedFor] = useState<string | null>(null);
  const [brokenFor, setBrokenFor] = useState<string | null>(null);
  const loadRequested = loadRequestedFor === mediaIdentity;
  const broken = brokenFor === mediaIdentity;
  const gated = isExternal && !blockedDataUri && !allowExternal && !loadRequested;
  const requestLoad = (): void => setLoadRequestedFor(mediaIdentity);
  const onMediaError = (): void => setBrokenFor(mediaIdentity);

  const aspectStyle: CSSProperties = {
    aspectRatio: dims === undefined ? PLACEHOLDER_ASPECT : `${dims.w} / ${dims.h}`,
  };

  // #625 — the RESERVATION half. `aspect-ratio` alone reserves NOTHING on an <img>: with no definite inline
  // size and no intrinsic size yet, a pre-load <img> lays out 0×0 and the ratio has no width to act on, so
  // the row still reflows the instant the bytes land. The intrinsic-size ATTRIBUTES give it that definite
  // width — `max-w-full` then caps it to the bubble and `height: auto` hands the height back to the declared
  // ratio (without it the `height` attribute would pin a literal pixel height against a capped width).
  // Declared dims ONLY: the no-dims path stays byte-identical to the #622 `auto 16 / 9` arm.
  const intrinsic = dims === undefined ? {} : { width: dims.w, height: dims.h };
  const imageStyle: CSSProperties = dims === undefined ? aspectStyle : { ...aspectStyle, height: "auto" };

  // `rounded-base` (not `card`): media and its gate/broken placeholders are GROUPED CONTENT inside the
  // message bubble, which is the elevated island itself (UI-Density-Law.md §2.1 D6).
  const fallbackClass = cn(
    "flex w-full max-w-full items-center justify-center rounded-base border border-border bg-muted p-block text-body leading-body text-muted-foreground",
    className,
  );

  // Blocked before the gate: a data: URI never gets a click-to-load chance.
  if (blockedDataUri) {
    return (
      <div className={fallbackClass} style={aspectStyle} data-slot="message-media-blocked">
        Media blocked
      </div>
    );
  }

  if (gated) {
    return (
      <button type="button" onClick={requestLoad} className={fallbackClass} style={aspectStyle} data-slot="message-media-placeholder">
        External media — load from {hostOf(src.url)}?
      </button>
    );
  }

  // Graceful fallback instead of the browser's native broken-image glyph or a silently-empty video/audio.
  if (broken) {
    return (
      <div className={fallbackClass} style={aspectStyle} data-slot="message-media-broken">
        Media unavailable
      </div>
    );
  }

  // `object-contain` is the braces to the `auto` belt above: when a producer DOES declare `dims` and they
  // disagree with the bytes (a re-encoded/rotated asset), the declared box still wins the LAYOUT — but the
  // image letterboxes inside it instead of distorting. Never `fill` (the UA default): we do not lie about
  // what an image looks like. A consumer needing a crop passes `object-cover` via `className` (tw-merge wins).
  const mediaClass = cn("max-w-full rounded-base object-contain", className);

  if (media === "image") {
    const img = (
      // biome-ignore lint/a11y/noNoninteractiveElementInteractions: onError is a load-status callback, not a user interaction — the standard React pattern for a broken-image fallback.
      <img src={src.url} alt={alt} loading="lazy" {...intrinsic} style={imageStyle} className={mediaClass} data-slot="message-media" onError={onMediaError} />
    );
    // A clickable image is wrapped in a button (keyboard-operable) — never an onClick on the <img>.
    return onActivate === undefined ? (
      img
    ) : (
      <button type="button" onClick={onActivate} className="block max-w-full" data-slot="message-media-zoom">
        {img}
      </button>
    );
  }

  if (media === "video") {
    return (
      <video controls={true} style={aspectStyle} aria-label={alt} className={mediaClass} data-slot="message-media" onError={onMediaError}>
        <source src={src.url} />
        {/* WCAG 1.2.2: declare the track even with no caption source; an empty WebVTT data-URI satisfies the rule. */}
        <track kind="captions" default={true} src="data:text/vtt,WEBVTT" />
      </video>
    );
  }

  return (
    <audio controls={true} aria-label={alt} className={mediaClass} data-slot="message-media" onError={onMediaError}>
      <source src={src.url} />
      <track kind="captions" default={true} src="data:text/vtt,WEBVTT" />
    </audio>
  );
}

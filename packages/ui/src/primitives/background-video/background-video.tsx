import type { ReactElement } from "react";
import { useEffect, useRef, useState } from "react";
import { cn, usePrefersReducedMotion } from "#lib";
import { backgroundVideoVariants } from "./variants";

export interface BackgroundVideoProps {
  /** The video source URL (an owned same-origin blob for the background use). */
  readonly src: string;
  /** Force the STILL frame regardless of the OS motion preference — a consumer's app-level "reduce
   *  motion" toggle. OS `prefers-reduced-motion: reduce` ALWAYS stills, independent of this flag. */
  readonly paused?: boolean;
  /** Passthrough skin — e.g. an `object-contain` utility overriding the baked `object-cover`. */
  readonly className?: string;
}

/**
 * BackgroundVideo — a decorative, muted, looping background `<video>` primitive (BG-V). POLICY IS BAKED,
 * NOT PROPPED: `muted`/`loop`/`autoplay`/`playsInline` are invariants (a background loop is never a
 * controllable player), the element is `aria-hidden` + focus-excluded with NO `controls`, and it PAUSES
 * when the tab is hidden (`document.hidden`, Page Visibility API) to stop wasted decode + avoid holding the
 * screen awake in a background tab.
 *
 * MOTION POLICY: OS `prefers-reduced-motion: reduce` OR the `paused` prop → the STILL frame. The video is
 * loaded (`preload="auto"`) but never played, so it holds its first decoded frame — FIRST-FRAME is the
 * still (no separate poster asset is threaded). `data-motion` (`"playing"`|`"still"`) reflects the
 * resolved motion state for styling consumers and tests.
 *
 * The native `<video>` attribute surface is DELIBERATELY NOT exposed: every background-loop attribute is a
 * policy invariant, so a passthrough prop would be an escape hatch around the policy — hence the narrow
 * `{ src, paused, className }` shape, not `extends ComponentProps<"video">`. ui deps kit only;
 * positioning/scrim/z-index live in the app-shell composite (ThemeBackgroundVideoLayer).
 */
export function BackgroundVideo({ src, paused = false, className }: BackgroundVideoProps): ReactElement {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const osReducedMotion = usePrefersReducedMotion();
  const still = osReducedMotion || paused;
  const [animating, setAnimating] = useState(false);

  // Play/pause is driven imperatively off the element ref inside the effect (never read/written in render —
  // the react-hooks/refs render ban). Re-runs on the motion state + source, and on every `visibilitychange`.
  useEffect(() => {
    const video = videoRef.current;
    if (video === null || src.length === 0) {
      return;
    }
    const sync = (): void => {
      const current = videoRef.current;
      if (current === null) {
        return;
      }
      const stillNow = still || document.hidden;
      setAnimating(!stillNow);
      if (stillNow) {
        current.pause();
        return;
      }
      // A rejected play() (an autoplay-policy edge) is a no-op — muted playback is unconditionally allowed.
      void current.play().catch(() => undefined);
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return (): void => document.removeEventListener("visibilitychange", sync);
  }, [still, src]);

  return (
    <video
      ref={videoRef}
      aria-hidden="true"
      tabIndex={-1}
      data-slot="background-video"
      data-motion={animating ? "playing" : "still"}
      className={cn(backgroundVideoVariants(), className)}
      src={src}
      muted={true}
      loop={true}
      playsInline={true}
      autoPlay={!still}
      preload="auto"
    >
      {/* A muted, decorative, aria-hidden background loop carries no dialogue — an empty captions track
          satisfies the media-caption a11y contract without a suppression (there is nothing to caption). */}
      <track kind="captions" />
    </video>
  );
}

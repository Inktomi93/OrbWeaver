// BootVeil — the app's boot loading screen: the brand web woven live under a dissolving veil
// (docs/design/login-loading-screen.md §1/§4.3/§9). Mounted ONCE from main.tsx above the router
// (app-splash is app-shell chrome, §13.9) so it covers route resolution, code, and the initial reads.
//
// THE EXIT IS LOAD-GATED (owner tweak 3, §9.3): the veil watches `data-app-ready` on <html> — the one
// readiness seam (`lib/agent-bridge.ts` installAppReadySignal: query-cache idle after initial reads;
// PRESENCE means stop waiting, including the 20s `degraded` ceiling). Slow boot → the weave fills the
// actual wait and settles, then dissolves the instant ready lands.
//
// MINIMUM-DISPLAY FLOOR (owner, 2026-08-09): a bare load-gate makes a FAST boot flash the veil up and
// vanish sub-second — reads as a bug. So a mounted veil stays up until BOTH ready AND a coherent beat
// (MIN_VISIBLE_MS) has played: a fast boot gets a real beat of the weave + the buttery dissolve; a slow
// boot is unaffected (the floor elapsed long before ready). The floor is NOT applied to a truly-instant
// boot (already-ready at mount → renders nothing, below) nor under reduced motion (no animation to beat;
// §3.9 keeps the exit an instant swap).
//
// Already-ready at first render (an in-session remount) ⇒ renders nothing — no flash of a veil over
// a live app. After its one exit the veil unmounts for good (state, not a timer).

import { Row, Stack } from "@orb/ui/layout";
import { usePrefersReducedMotion } from "@orb/ui/lib";
import { Text } from "@orb/ui/text";
import type { WeavePhase } from "@orb/ui/web-weave";
import { WeaveVeil, WebWeave } from "@orb/ui/web-weave";
import type { ReactElement } from "react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { WeaveGlyph } from "#lib";

/** The readiness seam (agent-bridge.ts READY_ATTR — presence = stop waiting; value may be "degraded"). */
const READY_ATTR = "data-app-ready";

function subscribeReady(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: [READY_ATTR] });
  return (): void => observer.disconnect();
}
const getReady = (): boolean => document.documentElement.hasAttribute(READY_ATTR);
/** SSR/prerender: treat as ready — a server render must never emit a veil the client can't drive. */
const getReadyServer = (): boolean => true;

/** The weave phase captions (mock parity — micro, muted, one beat per real construction phase). */
const PHASE_CAPTIONS: Readonly<Record<WeavePhase, string>> = {
  bridge: "casting the bridge line",
  anchor: "dropping the anchor",
  frame: "closing the frame",
  radii: "spinning radii",
  scaffold: "scaffolding the spiral",
  capture: "laying the capture spiral",
  settled: "ready",
};

/** The boot hub sits high so the weave reads over the foot chrome (mock: 0.5/0.42). */
const BOOT_HUB = { x: 0.5, y: 0.42 } as const;
const WORDMARK_GLYPH_PX = 26;
/** The minimum-display floor (owner): a mounted veil plays at least this coherent beat before it can
 *  dissolve, so a fast boot never flashes. Tunable; ~1s reads as a beat without stalling a slow boot. */
const MIN_VISIBLE_MS = 1000;

/** The boot loading veil — mount above the router; exits itself on `data-app-ready` (after the floor). */
export function BootVeil(): ReactElement | null {
  const ready = useSyncExternalStore(subscribeReady, getReady, getReadyServer);
  const reduced = usePrefersReducedMotion();
  // Latched at first render: a veil that would already be open-and-closing is simply never shown.
  const [initiallyReady] = useState(ready);
  const [exited, setExited] = useState(false);
  const [phase, setPhase] = useState<WeavePhase>("bridge");
  // The floor timer starts at mount; `floorElapsed` gates the exit alongside `ready`. Skipped when the
  // veil never mounts (initiallyReady) or under reduced motion (instant swap — no beat to protect).
  const [floorElapsed, setFloorElapsed] = useState(false);
  useEffect(() => {
    if (initiallyReady || reduced) {
      return;
    }
    const timer = setTimeout(() => setFloorElapsed(true), MIN_VISIBLE_MS);
    return (): void => clearTimeout(timer);
  }, [initiallyReady, reduced]);
  if (initiallyReady || exited) {
    return null;
  }
  // Open until BOTH the app is ready AND the beat has played (the floor is inert under reduced motion).
  const floorHeld = !(reduced || floorElapsed);
  return (
    <WeaveVeil open={!ready || floorHeld} onExited={(): void => setExited(true)} label="Loading orbweaver">
      <WebWeave state="weaving" hub={BOOT_HUB} onPhaseChange={setPhase} className="absolute inset-0" />
      <Stack justify="end" align="center" gap="row" padding="section" className="relative size-full">
        <Text voice="kicker" aria-hidden={true}>
          {PHASE_CAPTIONS[phase]}
        </Text>
        <Row align="center" justify="center" gap="row" aria-hidden={true} data-slot="brand-wordmark">
          {/* data-slot carries the wordmark readability halo (client globals.css) — the near-white
              name floats over the live weave; a bright strand behind a glyph drops worst-case contrast. */}
          <WeaveGlyph decorative={true} size={WORDMARK_GLYPH_PX} className="text-primary" />
          <Text as="span" voice="monogram">
            orbweaver
          </Text>
        </Row>
      </Stack>
    </WeaveVeil>
  );
}

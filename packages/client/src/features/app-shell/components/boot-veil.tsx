// BootVeil — the app's boot loading screen: the brand web woven live under a dissolving veil
// (docs/design/login-loading-screen.md §1/§4.3/§9). Mounted ONCE from main.tsx above the router
// (app-splash is app-shell chrome, §13.9) so it covers route resolution, code, and the initial reads.
//
// THE EXIT IS LOAD-GATED, NEVER TIMED (owner tweak 3, §9.3): the veil watches `data-app-ready` on
// <html> — the one readiness seam (`lib/agent-bridge.ts` installAppReadySignal: query-cache idle
// after initial reads; PRESENCE means stop waiting, including the 20s `degraded` ceiling) — and
// dissolves the INSTANT it appears. Fast boot → graceful early cut mid-weave (the dissolve IS the
// cut); slow boot → the weave fills the actual wait and settles. The weave never imposes a minimum.
//
// Already-ready at first render (an in-session remount) ⇒ renders nothing — no flash of a veil over
// a live app. After its one exit the veil unmounts for good (state, not a timer).

import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { WeavePhase } from "@orb/ui/web-weave";
import { WeaveVeil, WebWeave } from "@orb/ui/web-weave";
import type { ReactElement } from "react";
import { useState, useSyncExternalStore } from "react";
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

/** The boot loading veil — mount above the router; exits itself on `data-app-ready`. */
export function BootVeil(): ReactElement | null {
  const ready = useSyncExternalStore(subscribeReady, getReady, getReadyServer);
  // Latched at first render: a veil that would already be open-and-closing is simply never shown.
  const [initiallyReady] = useState(ready);
  const [exited, setExited] = useState(false);
  const [phase, setPhase] = useState<WeavePhase>("bridge");
  if (initiallyReady || exited) {
    return null;
  }
  return (
    <WeaveVeil open={!ready} onExited={(): void => setExited(true)} label="Loading orbweaver">
      <WebWeave state="weaving" hub={BOOT_HUB} onPhaseChange={setPhase} className="absolute inset-0" />
      <Stack justify="end" align="center" gap="row" padding="section" className="relative size-full">
        <Text voice="kicker" aria-hidden={true}>
          {PHASE_CAPTIONS[phase]}
        </Text>
        <Row align="center" justify="center" gap="row" aria-hidden={true}>
          <WeaveGlyph decorative={true} size={WORDMARK_GLYPH_PX} className="text-primary" />
          <Text as="span" voice="monogram">
            orbweaver
          </Text>
        </Row>
      </Stack>
    </WeaveVeil>
  );
}

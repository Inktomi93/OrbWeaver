// WeaveVeil preview — the fullscreen boot/blocking veil (fixed inset-0, owns the dissolve exit).
// cardMode "single" + viewport override keep the fixed layer inside the card.
import { WeaveVeil, WebWeave } from "@orb/ui";

/** The boot moment: veil open, hero weave building, caption under the hub.
 *  The style override pins the veil fully entered for the static capture — the real component
 *  fades in over --motion-layout, and a screenshot mid-transition reads as a blank card. */
export function BootVeil() {
  return (
    <>
      <style>{`[role="status"] { opacity: 1 !important; filter: none !important; transition: none !important; }
.ds-single { height: 100vh; }`}</style>
      <WeaveVeil open label="Loading Orbweaver">
        <WebWeave state="weaving" hub={{ x: 0.5, y: 0.42 }} />
        <div
          className="text-muted-foreground"
          style={{ position: "absolute", left: 0, right: 0, top: "72%", textAlign: "center", fontSize: 13 }}
        >
          Spinning up the web…
        </div>
      </WeaveVeil>
    </>
  );
}

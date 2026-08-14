// WebWeave preview stories — the living brand web (canvas; container decides the size).
// The size-varied cells (WideShort/TallNarrow) exist deliberately: owner-reported defect —
// geometry pieces stick out of bounds at certain host aspect ratios.
import { WebWeave } from "@orb/ui";

function Host({ w, h, children }: { w: number; h: number; children: React.ReactNode }) {
  return (
    <div className="bg-background" style={{ width: w, height: h, position: "relative", overflow: "hidden", borderRadius: 8 }}>
      {children}
    </div>
  );
}

/** The resting state every surface shows after boot — hub default, spider tending. */
export function Settled() {
  return (
    <Host w={480} h={320}>
      <WebWeave state="settled" />
    </Host>
  );
}

/** The boot build animation (screenshot catches one mid-build frame; motion is the point). */
export function Weaving() {
  return (
    <Host w={480} h={320}>
      <WebWeave state="weaving" />
    </Host>
  );
}

/** The frozen half-woven web — radii done, no spiral (error/empty-state backdrop). */
export function Partial() {
  return (
    <Host w={480} h={320}>
      <WebWeave state="partial" />
    </Host>
  );
}

/** The departure beat — the spider rides a strand out (the A9 redirect moment). */
export function StrandOut() {
  return (
    <Host w={480} h={320}>
      <WebWeave state="strand-out" />
    </Host>
  );
}

/** Wide, short host (login backdrop shape) — the aspect ratio where overflow was reported. */
export function WideShort() {
  return (
    <Host w={640} h={180}>
      <WebWeave state="settled" hub={{ x: 0.5, y: 0.34 }} />
    </Host>
  );
}

/** Tall, narrow host (mobile shape) — the other reported-overflow regime. */
export function TallNarrow() {
  return (
    <Host w={220} h={420}>
      <WebWeave state="settled" />
    </Host>
  );
}

/** Dimmed under a card, spider hidden — the login-surface composition. */
export function DimmedNoSpider() {
  return (
    <Host w={480} h={320}>
      <WebWeave state="settled" dim={0.45} spider={false} />
    </Host>
  );
}

// Cascade-contract fixtures (non-test module — Spine-Testing §7: CT mounts ONLY from a non-test
// module). A bare `.shell-grid`-shaped DOM with shell.css + the client's globals.css (the glass
// recipe) ACTUALLY IMPORTED, so computed-style assertions in shell-cascade.ct.tsx exercise the real
// cascade rules — not a re-implementation of them. No AppShell data/query graph is needed: the bug
// class this guards (specificity ties between unlayered plain-CSS rules) lives entirely in the CSS,
// not in any component logic, so a minimal DOM with the same classes/attributes/slots reproduces it
// exactly.

import type { BlurSurface } from "@orb/contracts/settings";
import type { MessageRole } from "@orb/kit/message-role";
import type { ReactElement } from "react";
import { useAppearanceRootEffects } from "../../../../packages/client/src/features/app-shell/hooks/use-appearance-root-effects";
import "../../../../packages/client/src/features/app-shell/surfaces/shell.css";
import "../../../../packages/client/src/styles/globals.css";

export interface ShellCascadeFixtureProps {
  readonly elevation?: "flat" | "ramp";
  readonly hasBgImage?: boolean;
  readonly blurSurfaces?: readonly BlurSurface[];
  readonly density?: "comfortable" | "compact";
  readonly fontScale?: number;
  readonly messageRole?: MessageRole;
}

/**
 * Stamps attrs exactly where production stamps them: `data-blur-*` on the DOCUMENT ROOT via the real
 * `useAppearanceRootEffects` hook (app-shell.tsx never stamps these itself — Dialog/AlertDialog portal
 * to `document.body`, outside any wrapper div), `data-elevation`/`data-has-bg-image`/`data-density` on
 * the `.shell-grid` element (app-shell.tsx does this directly). The probes cover every surface named in
 * the bug report: panel, main, topbar, composer, a message bubble (chrome vs "dense" reading-surface
 * fill), and the two dialog popup slots.
 */
export function ShellCascadeFixture({
  elevation = "flat",
  hasBgImage = false,
  blurSurfaces = [],
  density = "comfortable",
  fontScale = 1,
  messageRole = "assistant",
}: ShellCascadeFixtureProps): ReactElement {
  useAppearanceRootEffects({ fontScale, dataTheme: null, blurSurfaces, shadowEffects: false });
  return (
    <div
      className="shell-grid"
      data-testid="shell-grid"
      data-elevation={elevation}
      data-density={density}
      {...(hasBgImage ? { "data-has-bg-image": "" } : {})}
    >
      <div className="shell-panel" data-panel-side="list" data-testid="panel-probe" />
      <div className="shell-main" data-testid="main-probe">
        <div className="shell-topbar" data-testid="topbar-probe" />
      </div>
      <div data-slot="composer" data-testid="composer-probe" />
      <div data-role={messageRole}>
        <div data-slot="message-bubble" data-testid="bubble-probe" />
      </div>
      <div data-slot="dialog-popup" data-testid="dialog-probe" />
      <div data-slot="alert-dialog-popup" data-testid="alert-dialog-probe" />
    </div>
  );
}

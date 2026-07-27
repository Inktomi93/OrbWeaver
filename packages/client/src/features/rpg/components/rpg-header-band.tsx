// The takeover HEADER-BAND host (Context-Panel-Program §4.2/§4.5/§4.11 #3) — resolves the takeover panel
// state and renders the scene banner + pool orbs into the `.shell-panel-header` BAND slot ABOVE both strips
// (the W3c header-contributor seam: a `ContextTabDef.header` supplied by the rpg contributor, gated on the
// same game-ness `when` as the game tabs). Homed as its own component because it calls a hook
// (`useRpgContextState`) and must therefore BE a component (rules-of-hooks) — the contribution `lib/` module
// stays a components-free data file (useComponentExportOnlyModules). `null` from the hook (a race where the
// pointer cleared mid-render) collapses to nothing, letting the band fall back to the neutral default.

import type { ChatId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import { useRpgContextState } from "../hooks/use-rpg-context-state";
import { RpgTakeoverHeader } from "./rpg-takeover-header";

export interface RpgHeaderBandProps {
  readonly chatId: ChatId;
}

/** Resolve the panel state and render the scene banner + orbs into the header band. */
export function RpgHeaderBand({ chatId }: RpgHeaderBandProps): ReactElement | null {
  const state = useRpgContextState(chatId);
  if (state === null) {
    return null;
  }
  return <RpgTakeoverHeader ambient={state.tracker.ambient} poolOrbs={state.tracker.poolOrbs} trackersReadOnly={state.tracker.trackersReadOnly} />;
}

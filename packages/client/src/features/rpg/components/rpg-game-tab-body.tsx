// One game-tab body wrapper (Context-Panel-Program §4.4) — resolves the takeover panel state (suspending on
// the rpg reads) and renders the tab's content. The scene banner + orbs are NOT here: they ride the HUD's
// OWN band above the rails (`rpg-hud.tsx` → `RpgHeaderBand`), so a game tab body carries ONLY its content. Homed as its own component module because it calls a hook
// (`useRpgContextState`) and must therefore BE a component (rules-of-hooks) — the contribution `lib/` module
// stays a components-free data file (useComponentExportOnlyModules). Takes the active chat id (the
// contributor's `when` already gated game-ness cache-first); the hook re-reads getChat + the rpg views
// self-contained. `null` from the hook (a race where the pointer cleared mid-render) collapses to an honest
// one-liner.

import type { ChatId } from "@orb/kit/ids";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import type { RpgPanelState } from "../hooks/use-rpg-context-state";
import { useRpgContextState } from "../hooks/use-rpg-context-state";

export interface RpgGameTabBodyProps {
  readonly chatId: ChatId;
  readonly render: (state: RpgPanelState) => ReactNode;
}

/** Resolve the panel state and render the tab's content (the header band is a separate seam, W3c). */
export function RpgGameTabBody({ chatId, render }: RpgGameTabBodyProps): ReactElement {
  const state = useRpgContextState(chatId);
  if (state === null) {
    return <Text>This chat is no longer a game.</Text>;
  }
  return <>{render(state)}</>;
}

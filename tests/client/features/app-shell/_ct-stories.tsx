// Story module for the app-shell CTs (Spine-Testing §7 — CT mounts ONLY from a non-test module).
// The stories compose the shell through its FRONT DOOR (@orb/client/features/app-shell) with plain
// text content in the section slots, and the Rail leaf via a relative package path (a story may reach
// feature internals the front door doesn't re-export). No tRPC/Query needed — the shell store is pure
// zustand; the beforeMount Toast/Tooltip chrome covers the rail's tooltips.

import { AppShell } from "@orb/client/features/app-shell";
import type { ReactElement } from "react";
import { Rail } from "../../../../packages/client/src/features/app-shell/components/rail";

/** The full shell with a chats CONTENT slot + a corpus LIST/CONTENT slot; other sections fall back. */
export function AppShellStory(): ReactElement {
  return (
    <AppShell
      sections={{
        chats: { content: <p>chats content pane</p> },
        corpus: { list: <p>corpus list pane</p>, content: <p>corpus content pane</p> },
      }}
    />
  );
}

/** The Rail in isolation — a11y + keyboard nav over real <button>s, registry-driven. */
export function RailStory(): ReactElement {
  return (
    <Rail
      activeSection="chats"
      onSelectSection={(): void => undefined}
      onOpenModal={(): void => undefined}
    />
  );
}

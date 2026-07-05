// Story module for the app-shell CTs (Spine-Testing §7 — CT mounts ONLY from a non-test module).
// The stories compose the shell through its FRONT DOOR (@orb/client/features/app-shell) with plain
// text content in the section slots, and the Rail leaf via a relative package path (a story may reach
// feature internals the front door doesn't re-export).
//
// DATA PROVIDERS (Query + tRPC): required since AppShell reads the synced density pref via
// `useDensity` (a non-suspense `useQuery(settings.getUserSettings)` — the §11.0 sanctioned cross-cutting
// display read). The query is UNSTUBBED here (no backend in CT): the hook is designed to degrade — a
// pending/errored read falls back to `DEFAULT_APPEARANCE_SETTINGS.density`, so the shell renders
// immediately with the default density and never suspends. Without the provider AppShell throws
// "No QueryClient set" and renders nothing (the beforeMount chrome only stacks Toast/Tooltip/Theme).
// The Rail leaf alone needs no data layer (RailStory stays bare).

import { AppShell } from "@orb/client/features/app-shell";
import type { ReactElement } from "react";
import { Rail } from "../../../../packages/client/src/features/app-shell/components/rail";
import { CtDataProviders } from "../../../support/ct/ct-data-providers";

/** The full shell with a chats CONTENT slot + a corpus LIST/CONTENT slot; other sections fall back. */
export function AppShellStory(): ReactElement {
  return (
    <CtDataProviders>
      <AppShell
        sections={{
          chats: { content: <p>chats content pane</p> },
          corpus: { list: <p>corpus list pane</p>, content: <p>corpus content pane</p> },
        }}
      />
    </CtDataProviders>
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

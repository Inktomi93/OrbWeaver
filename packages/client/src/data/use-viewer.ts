// The ONE canonical "who am I" hook. Composes three already-cached reads (sessions.me, settings, persona
// list) via useSuspenseQueries so every caller dedupes on the shared Query cache instead of re-fetching.

import { useSuspenseQueries } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "./trpc.ts";
import { useTRPC } from "./trpc.ts";

/** The lean current-persona summary, resolved current-pointer -\> default-pointer -\> first owned -\> null. */
export interface ViewerPersona {
  readonly id: string;
  readonly name: string;
  readonly avatarHash: string | null;
}

/** The composed viewer: the server identity (`sessions.me`) plus the derived current persona. */
export type Viewer = inferOutput<Trpc["sessions"]["me"]> & {
  readonly currentPersona: ViewerPersona | null;
};

/** The canonical viewer read. Suspends until identity + settings + personas resolve (wrap the caller in a
 *  `<QueryBoundary>`). Composition is pure — the derived `currentPersona` recomputes when any source moves. */
export function useViewer(): Viewer {
  const trpc = useTRPC();
  const [{ data: identity }, { data: settings }, { data: personas }] = useSuspenseQueries({
    queries: [trpc.sessions.me.queryOptions(), trpc.settings.getUserSettings.queryOptions(), trpc.persona.list.queryOptions()],
  });

  const currentId = settings.config.seeds.currentPersonaId;
  const defaultId = settings.config.seeds.defaultPersonaId;
  // Mirrors persona-panel-surface.tsx's `current` resolution exactly.
  const persona = personas.find((p) => p.id === currentId) ?? personas.find((p) => p.id === defaultId) ?? personas[0];
  const currentPersona: ViewerPersona | null = persona === undefined ? null : { id: persona.id, name: persona.name, avatarHash: persona.avatarHash };

  return { ...identity, currentPersona };
}

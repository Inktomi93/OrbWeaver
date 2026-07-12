// data/use-viewer — the ONE canonical "who am I" hook (the `upload-asset` precedent for a domain-shaped
// client seam in `data/`). Many surfaces need the viewer's identity + their current persona; before this,
// that info was smeared per-chat onto `chat.getChat`. This composes THREE already-cached reads so every
// caller dedupes on the shared Query cache instead of each re-fetching:
//   • `sessions.me` — the server viewer read (`userId`/`handle`/`globalRole`), a pure `Principal` projection.
//   • `settings.getUserSettings` — the GLOBAL "current persona" pointer (`seeds.currentPersonaId`, the same
//     pointer `chat.startChat` seeds the anchor from — server `entry/compose/chat.ts resolveCurrentPersona`).
//   • `persona.list` — the owned personas, to resolve that pointer to a name + avatar CLIENT-side (v1 does
//     NO server persona join — the list is already cached by the persona surfaces).
// Suspense-style (`useSuspenseQueries`, PLURAL — the three reads fetch in parallel; a single-component chain
// of `useSuspenseQuery` would serialize them) per the `<QueryBoundary>` conventions: a caller wraps its use
// in a boundary and gets non-null data.
//
// FRESHNESS (the bus is the ONLY driver — `staleTime: Infinity`): the two COMPOSED sources self-heal — a
// persona edit emits `personasChanged` (invalidates `persona.list`) and a current-persona change emits
// `settingsChanged` (invalidates `getUserSettings`), both wired in `data/invalidation.ts`. `sessions.me`
// needs NO user-bus event of its own: identity is session-stable (a `handle` rename re-mints the session; a
// `globalRole` grant/revoke reflects on the next full load — server authz always re-reads the live row, so a
// stale client `globalRole` is only a UI hint). Adding an invalidation-map entry would require an emitted
// event that does not exist, so none is added (per `invalidation.ts`'s "a map entry needs a covering event").

import { useSuspenseQueries } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { Trpc } from "./trpc";
import { useTRPC } from "./trpc";

/** The lean current-persona summary derived client-side. Resolves the EFFECTIVE current persona:
 *  current-pointer → default-pointer → first owned → null (null ONLY when the user owns zero personas,
 *  the legitimate pre-first-run state — a stale/unset pointer with personas present still resolves one, the
 *  owner "never no persona when you have one" ruling). `avatarHash` is the CAS key the avatar primitives
 *  resolve to a blob URL. */
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
    queries: [
      trpc.sessions.me.queryOptions(),
      trpc.settings.getUserSettings.queryOptions(),
      trpc.persona.list.queryOptions(),
    ],
  });

  const currentId = settings.config.seeds.currentPersonaId;
  const defaultId = settings.config.seeds.defaultPersonaId;
  // EFFECTIVE-current resolution (owner ruling: with >=1 persona, one MUST resolve as current —
  // "no persona" is legitimate ONLY pre-first-run, i.e. `personas.length === 0`). The stored pointer is
  // the source hardening's job (remove.ts re-points on delete); this fallback is the DISPLAY safety net so
  // a stale/unset pointer with personas present still renders SOMEONE: current -> default -> first -> null.
  // Kept semantically identical to `persona-panel-surface.tsx`'s `current` (the two are intentionally mirrored).
  const persona =
    personas.find((p) => p.id === currentId) ??
    personas.find((p) => p.id === defaultId) ??
    personas[0];
  const currentPersona: ViewerPersona | null =
    persona === undefined
      ? null
      : { id: persona.id, name: persona.name, avatarHash: persona.avatarHash };

  return { ...identity, currentPersona };
}

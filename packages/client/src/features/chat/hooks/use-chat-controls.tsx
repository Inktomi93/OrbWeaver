// S1 — THE control-source consumer mechanism (interaction-direction-spec.md §3-S1): one hook, one host.
// It reads the door-assembled `chat-controls` registry, yields the invisible per-source MOUNTS (each
// publishes its live control list from its OWN fiber, so a source's hooks — a bus subscription, a store
// read, a mutation — never run in a loop at the host), and returns the collected controls in door order.
//
// This is the `useSlashCommands` shape with ONE difference, and the difference is the reason it is a
// separate mechanism: a slash runner is imperative and lives in a ref (read at EVENT time, never in
// render), while a control IS render data — a chip that arrives has to paint. So published lists live in
// state, keyed by source id, and a publish that is ELEMENT-WISE identical to the last one is a no-op (see
// `sameControls` — a source re-rendering for its own reasons must not re-render the band, and a DERIVING
// source must not be able to spin one).

import type { ReactNode } from "react";
import { useState } from "react";
import type { ChatControl, ChatControlSource, ChatRoomSurfaceState, ContributorRegistry } from "#lib";

/** Empty at module scope: the initial state is one shared frozen map, never a fresh allocation per mount. */
const NO_CONTROLS: ReadonlyMap<string, readonly ChatControl[]> = new Map();

/** ELEMENT-WISE identity, not array identity — the publish guard's real predicate.
 *
 *  WHY it is not a `===` on the array: a source that DERIVES its published list (the common shape — a
 *  stable set of controls minus the ones the member dismissed) hands over a fresh array on every render
 *  while every control in it is the same object. Comparing arrays would accept that as "changed", set
 *  state, re-render the band, re-render the source, and publish again — a render loop whose only tell is a
 *  pegged CPU. A source must be able to derive; the guard is where that is made safe. */
function sameControls(a: readonly ChatControl[], b: readonly ChatControl[]): boolean {
  return a.length === b.length && a.every((control, i) => control === b[i]);
}

export interface ChatControlsView {
  /** Every live control, in door order (sources) then arrival order (within a source). */
  readonly controls: readonly ChatControl[];
  /** The invisible source mounts — the host renders these unconditionally, beside whatever it paints. */
  readonly mounts: ReactNode;
}

/** Mounts every registered control source against one room and collects what they publish. */
export function useChatControls(sources: ContributorRegistry<ChatControlSource>, state: ChatRoomSurfaceState): ChatControlsView {
  const [published, setPublished] = useState<ReadonlyMap<string, readonly ChatControl[]>>(NO_CONTROLS);
  const list = sources.list();
  // Stable per-source publish callbacks (the compiler caches this map on the source list) → a source's
  // publish effect registers ONCE instead of re-firing on every re-render of the band above it.
  const publishers = new Map(
    list.map(
      (source) =>
        [
          source.id,
          (next: readonly ChatControl[]): void => {
            setPublished((prev) => {
              const current = prev.get(source.id);
              return current !== undefined && sameControls(current, next) ? prev : new Map(prev).set(source.id, next);
            });
          },
        ] as const,
    ),
  );

  const mounts = list.map((source) => {
    const Mount = source.mount;
    const publish = publishers.get(source.id);
    return publish === undefined ? null : <Mount key={source.id} state={state} publish={publish} />;
  });

  const controls = list.flatMap((source) => published.get(source.id) ?? []);
  return { controls, mounts };
}

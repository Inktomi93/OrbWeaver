// S1 — THE control-source consumer mechanism: one hook, one host.
// It reads the door-assembled `chat-controls` registry, yields the invisible per-source MOUNTS (each
// publishes its live control list from its OWN fiber, so a source's hooks — a bus subscription, a store
// read, a mutation — never run in a loop at the host), and returns the collected controls in door order.
//
// This is the `useSlashCommands` shape with ONE difference, and the difference is the reason it is a
// separate mechanism: a slash runner is imperative and lives in a ref (read at EVENT time, never in
// render), while a control IS render data — a chip that arrives has to paint. So published lists live in
// state, keyed by source id, and a publish whose controls are CONTENT-equal to the last one is a no-op (see
// `sameControls` — a source re-rendering for its own reasons must not re-render the band, and a source that
// REBUILDS its list every render must not be able to spin one).

import type { ReactNode } from "react";
import { useState } from "react";
import type { ChatControl, ChatControlAction, ChatControlSource, ChatRoomSurfaceState, ContributorRegistry } from "#lib";

/** Empty at module scope: the initial state is one shared frozen map, never a fresh allocation per mount. */
const NO_CONTROLS: ReadonlyMap<string, readonly ChatControl[]> = new Map();

/** CONTENT equality over the RENDERED fields — the publish guard's predicate, and the reason a source may
 *  rebuild its list freely.
 *
 *  WHY NOT `===` ON THE ARRAY: a source that DERIVES its published list (a stable set minus what the member
 *  dismissed) hands over a fresh array every render while the controls in it are the same objects.
 *
 *  WHY NOT `===` PER ELEMENT EITHER (hardened after review, 2026-08-24): the natural bus-driven source
 *  rebuilds the control OBJECTS every render too — fresh `run`/`dismiss` closures over the latest state —
 *  so identity comparison would call every publish a change, re-render the band, re-render the source, and
 *  publish again: a render loop whose only tell is a pegged CPU. Comparing what the band actually RENDERS
 *  makes that shape safe, and no visible update can be swallowed because every visible field is compared.
 *
 *  WHAT IS DELIBERATELY NOT COMPARED: the closures and a card's `detail` node (a ReactNode is rebuilt per
 *  render by construction, so comparing it would re-open the loop). An ignored publish therefore KEEPS the
 *  previous objects — which is why `ChatControlSourceMountProps` states the source's half of the deal: a
 *  control whose behaviour changes gets a new `id`. */
function sameAction(a: ChatControlAction, b: ChatControlAction): boolean {
  if (a.id !== b.id || a.label !== b.label || a.mode !== b.mode) {
    return false;
  }
  if (a.mode === "execute" || b.mode === "execute") {
    // Both are the execute arm (the modes are equal above), so both carry `pending`; the runner is not
    // compared (see the header).
    return a.mode === "execute" && b.mode === "execute" && a.pending === b.pending;
  }
  return a.text === b.text;
}

function sameActions(a: readonly ChatControlAction[], b: readonly ChatControlAction[]): boolean {
  return (
    a.length === b.length &&
    a.every((action, i) => {
      const other = b[i];
      return other !== undefined && sameAction(action, other);
    })
  );
}

function sameControl(a: ChatControl, b: ChatControl): boolean {
  if (a.kind !== b.kind || a.id !== b.id) {
    return false;
  }
  if (a.kind === "chip") {
    return b.kind === "chip" && sameAction(a.action, b.action);
  }
  return b.kind === "card" && a.title === b.title && sameActions(a.actions, b.actions);
}

function sameControls(a: readonly ChatControl[], b: readonly ChatControl[]): boolean {
  return (
    a.length === b.length &&
    a.every((control, i) => {
      const other = b[i];
      return other !== undefined && sameControl(control, other);
    })
  );
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

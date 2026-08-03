// The plot hand-edit callbacks (#2 — act NAME + PROGRESS; host). Homed in lib/ (components-free — the
// component-export-only rule bars a builder fn from the rail's component module). Both callbacks ride
// `editSnapshot` on the snapshot-resident `plot` plane and send the WHOLE next plot object under the
// [merge-clear] recursion (the acts array replaces wholesale), padding untitled acts on an advance
// (mirrors the applier's `acts.length >= act` maintenance). FINE lock paths per #10: `plot.acts` for a
// title edit, `plot.act` for a progress edit — a pinned act rail is precise, never a whole-plot pin.

import type { RpgPanelState } from "../hooks/use-rpg-context-state.ts";
import type { useEditSnapshot } from "../hooks/use-rpg-mutations.ts";

/** The plot hand-edit callbacks the act rail consumes. */
export interface PlotEdit {
  readonly onEditActTitle: (next: string) => void;
  readonly onEditAct: (next: number) => void;
  readonly isLocked: (path: string) => boolean;
  readonly onRelease: (path: string) => void;
}

/** Build the plot hand-edit callbacks (see the module header for the write + lock grammar). */
export function buildPlotEdit(state: RpgPanelState, editSnapshot: ReturnType<typeof useEditSnapshot>): PlotEdit {
  const { tracker, chatId } = state;
  return {
    onEditActTitle: (next): void => {
      const plot = tracker.plot;
      if (plot === null) {
        return;
      }
      const acts = plot.acts.map((a, i) => (i === plot.act - 1 ? { ...a, title: next } : { ...a }));
      editSnapshot.mutate({ chatId, patch: { plot: { act: plot.act, title: plot.title, acts } }, lockPaths: ["plot.acts"] });
    },
    onEditAct: (next): void => {
      const plot = tracker.plot;
      if (plot === null) {
        return;
      }
      const acts = plot.acts.map((a) => ({ ...a }));
      while (acts.length < next) {
        acts.push({ title: "", summary: "" });
      }
      editSnapshot.mutate({ chatId, patch: { plot: { act: next, title: plot.title, acts } }, lockPaths: ["plot.act"] });
    },
    isLocked: (path): boolean => tracker.lockedPaths.includes(path),
    onRelease: (path): void => editSnapshot.mutate({ chatId, patch: {}, releaseLocks: [path] }),
  };
}

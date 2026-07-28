// The Rewrite (Corrections) modal state hook (W-D — extracted from the old composer-wand so the guided
// cluster's ✨ Corrections item and the dialog share ONE state home). State is OWNED here (not the dialog)
// so an Esc/Cancel preserves the typed instruction + toggle selection (D57 input-recovery posture): closing
// never destroys state; only an explicit Apply (fire + reset) clears it. Apply composes the selected toggle
// fragments + the free text into ONE steer (composeRewriteSteer) and fires guided.fireRewrite.

import type { RewriteToggleId } from "@orb/contracts/preset";
import { REWRITE_TOGGLES } from "@orb/contracts/preset";
import { composeRewriteSteer } from "@orb/kit/guided";
import { useState } from "react";

export interface RewriteModal {
  readonly isOpen: boolean;
  readonly setOpen: (open: boolean) => void;
  readonly instruction: string;
  readonly setInstruction: (text: string) => void;
  readonly toggles: ReadonlySet<RewriteToggleId>;
  readonly toggle: (id: RewriteToggleId, on: boolean) => void;
  readonly open: () => void;
  readonly apply: () => void;
}

export function useRewriteModal(trimmed: string, fireRewrite: (steer: string) => void, onChange: (text: string) => void): RewriteModal {
  const [isOpen, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [toggles, setToggles] = useState<ReadonlySet<RewriteToggleId>>(new Set<RewriteToggleId>());

  const open = (): void => {
    // Pre-seed the instruction from the current composer draft when one exists — the wand gesture (type a
    // steer, fire Corrections) is not orphaned; an empty composer opens with whatever the last session kept.
    if (trimmed.length > 0) {
      setInstruction(trimmed);
    }
    setOpen(true);
  };
  const toggle = (id: RewriteToggleId, on: boolean): void => {
    setToggles((prev) => {
      const next = new Set(prev);
      if (on) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };
  const apply = (): void => {
    // Compose in CATALOG ORDER so the fired steer is deterministic regardless of click order — the composed
    // string becomes {{input}} inside the preset's rewrite template.
    const fragments = REWRITE_TOGGLES.filter((t) => toggles.has(t.id)).map((t) => t.fragment);
    const steer = composeRewriteSteer(fragments, instruction);
    if (steer.length === 0) {
      return; // belt: the dialog's Apply button is disabled until instruction OR a toggle is set (W-D §c)
    }
    fireRewrite(steer);
    setOpen(false);
    setInstruction("");
    setToggles(new Set<RewriteToggleId>());
    onChange("");
  };

  return { isOpen, setOpen, instruction, setInstruction, toggles, toggle, open, apply };
}

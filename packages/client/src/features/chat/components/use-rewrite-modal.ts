// The Rewrite (Corrections) modal state hook (W-D — extracted from the old composer-wand so the guided
// cluster's ✨ Corrections item and the dialog share ONE state home). State is OWNED here (not the dialog)
// so an Esc/Cancel preserves the typed instruction + toggle selection (D57 input-recovery posture): closing
// never destroys state; only an explicit Apply (fire + reset) clears it.
//
// Apply fires the picked toggle IDS + the free text — it does NOT compose (the templating fork's ARM B,
// owner 2026-08-09). The fragment bytes are preset prose slots the SERVER resolves and joins at the assembly
// seam that holds the preset blob, so the wire carries kinds only ("the wire carries only the kind, never
// template text"). Catalog ORDER is the server's to enforce too — this hook sends the ids the host picked.

import type { RewriteToggleId } from "@orb/contracts/preset";
import { REWRITE_TOGGLES } from "@orb/contracts/preset";
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

export function useRewriteModal(
  trimmed: string,
  fireRewrite: (steer: string, toggles: readonly RewriteToggleId[]) => void,
  onChange: (text: string) => void,
): RewriteModal {
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
    // The picked ids in CATALOG ORDER — the server composes in catalog order too, so this only makes the
    // captured wire body read the way the modal does (click order would be noise in a capture).
    const picked = REWRITE_TOGGLES.filter((t) => toggles.has(t.id)).map((t) => t.id);
    if (instruction.trim().length === 0 && picked.length === 0) {
      return; // belt: the dialog's Apply button is disabled until instruction OR a toggle is set (W-D §c)
    }
    fireRewrite(instruction, picked);
    setOpen(false);
    setInstruction("");
    setToggles(new Set<RewriteToggleId>());
    onChange("");
  };

  return { isOpen, setOpen, instruction, setInstruction, toggles, toggle, open, apply };
}

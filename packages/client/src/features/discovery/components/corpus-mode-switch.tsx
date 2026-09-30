// The Corpus `Explore | Insights | Labels` switch (D271, Variant A). ONE switch on screen at a time: it heads
// the LIST while the LIST is showing, and heads CONTENT while the LIST is off screen — so a phone on the
// Insights dashboard, or a pushed drill, still carries it.

import { Toggle } from "@orb/ui/toggle";
import { ToggleGroup } from "@orb/ui/toggle-group";
import type { ReactElement } from "react";
import { CORPUS_MODE_LABELS, CORPUS_MODES, isCorpusMode } from "#lib";
import { setCorpusMode, useCorpusMode } from "#state";

export function CorpusModeSwitch(): ReactElement {
  const mode = useCorpusMode();
  return (
    <ToggleGroup
      aria-label="Corpus mode"
      data-slot="corpus-mode-switch"
      fill={true}
      onValueChange={(picked): void => {
        const next = picked[0];
        // A one-of-N strip has no release: clicking the active segment yields an empty array.
        if (isCorpusMode(next) && next !== mode) {
          setCorpusMode(next);
        }
      }}
      semantics="radio"
      value={[mode]}
    >
      {CORPUS_MODES.map((option) => (
        <Toggle checked={option === mode} key={option} semantics="radio" value={option}>
          {CORPUS_MODE_LABELS[option]}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}

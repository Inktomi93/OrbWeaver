// The SUBJECT selector (owner ruling 2026-07-28, superseding the pill row): the member-scope switch IS
// the identity line — the current subject's NAME is the trigger, clicking it opens the dropdown of
// roster members (You / companions). No separate pill shelf. One primitive for every member-scoped tab
// (Sheet, Inventory — §12.1.3 one scope-selector semantics). The trigger is styled to read as the
// identity line's name (display-at-rest voice) while staying a fully accessible combobox (the caller's
// `ariaLabel` names it — "Whose sheet"/"Whose pack" — so agents/SRs can find, open, and pick).

import type { RpgActorView } from "@orb/contracts/rpg";
import { Select } from "@orb/ui/select";
import type { ReactElement } from "react";
import { actorKey } from "../lib/actor-key";

export interface RpgSubjectSelectProps {
  readonly actors: readonly RpgActorView[];
  /** The selected actor (the resolved subject — viewer default upstream). */
  readonly value: RpgActorView;
  readonly onChange: (key: string) => void;
  /** The combobox's accessible name ("Whose sheet" / "Whose pack"). */
  readonly ariaLabel: string;
}

/** The name-as-trigger subject dropdown. Callers render it only on a multi-member roster (a single
 *  subject is a plain name — nothing to switch). */
export function RpgSubjectSelect({ actors, value, onChange, ariaLabel }: RpgSubjectSelectProps): ReactElement {
  return (
    <Select
      aria-label={ariaLabel}
      items={actors.map((a) => ({ label: a.name, value: actorKey(a) }))}
      value={actorKey(value)}
      onValueChange={(next): void => {
        if (next !== null) {
          onChange(next);
        }
      }}
      // The identity-line voice: a text-height, chrome-free trigger — the NAME with the dropdown chevron,
      // not a form control box (display-at-rest; the popup is the affordance). That geometry is the
      // primitive's `inline` layout arm; only the weight is this site's own.
      layout="inline"
      className="font-semibold"
    />
  );
}

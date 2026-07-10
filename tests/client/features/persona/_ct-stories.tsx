// Story module for the persona-panel-row CT (Spine-Testing §7 — CT mounts ONLY from a non-test module).
// Drives the side-eye item-13 rework: the "set current" target is a stretched real `<Button>` pinned under
// the row's controls (NOT a hand-rolled role="button" div), and the avatar/name/action controls are
// disjoint SIBLINGS layered above it — so a CT can prove clicking a control fires ONLY its own action, not
// "set current" (no nesting, no stopPropagation crutch). The row instantiates `useUpdatePersona`, so it
// mounts under `CtDataProviders` (the trpc client) — the overlay tests trigger no network call.

import { PersonaPanelRow } from "@orb/client/features/persona";
import type { PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import { useState } from "react";
import { CtDataProviders } from "../../../support/ct/ct-data-providers";

type PersonaFixture = Parameters<typeof PersonaPanelRow>[0]["persona"];

const PERSONA: PersonaFixture = {
  id: castId<PersonaId>("persona_ct"),
  name: "Nova",
  title: "the navigator",
  description: "A steady hand at the helm.",
  starred: false,
  avatarAssetId: null,
  avatarHash: null,
  metadata: null,
  createdAt: 1,
  updatedAt: 1,
};

/** `<PersonaPanelRow>` under the data layer — records which callback fired into a visible marker so the CT
 *  can assert control clicks are disjoint from the "set current" overlay. */
export function PersonaPanelRowStory(): ReactElement {
  const [fired, setFired] = useState<string>("none");
  const [expanded, setExpanded] = useState(false);
  return (
    <CtDataProviders>
      <div style={{ width: 320 }}>
        <PersonaPanelRow
          expanded={expanded}
          isCurrent={false}
          isDefault={false}
          onDelete={(): void => setFired("delete")}
          onSetCurrent={(): void => setFired("current")}
          onSetDefault={(): void => setFired("default")}
          onToggleExpand={(): void => {
            setFired("expand");
            setExpanded((v) => !v);
          }}
          persona={PERSONA}
        />
        <p data-testid="fired">{fired}</p>
      </div>
    </CtDataProviders>
  );
}

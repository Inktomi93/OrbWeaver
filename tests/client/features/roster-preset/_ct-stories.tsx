// Story module for the saved-party picker CT (Spine-Testing §7 — CT mounts ONLY from a non-test
// module). The picker body suspends on `rosterPreset.list` (routed at the network by the `.ct.tsx`),
// so the story wraps it in the PRODUCTION QueryBoundary exactly as the modal definition does
// (`lib/saved-parties-modal.tsx`); no chat is selected, so the active-room affordances stay off and the
// story exercises the LIBRARY plane only (the in-room semantics are the composed-real int tier's —
// tests/server/entry/compose/roster-preset.int.test.ts).

import { QueryBoundary, SkeletonRows } from "@orb/client/data";
import type { ReactElement } from "react";
import { PartyPicker } from "../../../../packages/client/src/features/roster-preset/components/party-picker.tsx";
import { CtDataProviders } from "../../../support/ct/ct-data-providers.tsx";

export function PartyPickerStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 480 }}>
        <QueryBoundary fallback={<SkeletonRows count={4} shape="avatar-row" />}>
          <PartyPicker />
        </QueryBoundary>
      </div>
    </CtDataProviders>
  );
}

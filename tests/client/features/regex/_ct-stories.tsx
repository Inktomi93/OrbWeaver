// regex feature CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test module). The stories
// reach feature internals the front door doesn't re-export (the settings/workloads _ct-stories.tsx
// precedent): `RegexSettingsSurface` is mounted by the settings host through `regexPane`. The DISPLAY-tier
// story lives in the `#data` mirror beside the hook it exercises (`tests/client/data/_ct-stories.tsx`) —
// the CT bundler registers stories per directory, so a cross-directory story import double-declares.

import { RegexScriptPicker } from "@orb/client/components";
import { QueryBoundary } from "@orb/client/data";
import type { CharacterId } from "@orb/kit/ids";
import { Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { RegexSettingsSurface } from "../../../../packages/client/src/features/regex/surfaces/regex-settings-surface";
import { CtDataProviders } from "../../../support/ct/ct-data-providers";

/** The real Regex settings pane (the script LIBRARY) in isolation — `regex.listScripts`/`listGlobal` (reads)
 *  and `regex.createScript`/`updateScript`/`removeScript` (writes) are stubbed per-test via routeTrpc. */
export function RegexSettingsStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 560, overflow: "auto", width: 720 }}>
        <RegexSettingsSurface />
      </div>
    </CtDataProviders>
  );
}

const PICKER_CHARACTER = "character_ctpickerstoryyyyy" as CharacterId;

/** The shared PICKER at the character scope — attach/detach against `regex.listForCharacter`.
 *
 *  The `QueryBoundary` is REQUIRED, not decoration: the picker reads through `useSuspenseQuery`, so without
 *  a boundary the suspend has nothing to catch and the story mounts to a blank page (which is exactly how
 *  this suite first failed). In production the boundary is the surface's — the facet editor and the preset
 *  tab each mount the picker inside one — so the story supplying it is the story matching production, not
 *  papering over a gap. */
export function RegexPickerStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 720 }}>
        <QueryBoundary fallback={<p>loading…</p>} renderError={(error): ReactElement => <p role="alert">{String(error)}</p>}>
          <RegexScriptPicker
            scope={{ kind: "character", characterId: PICKER_CHARACTER }}
            heading="Regex scripts"
            helperText="Rules that run whenever this character is in the room."
          />
        </QueryBoundary>
      </div>
    </CtDataProviders>
  );
}

/** The picker as a DECK GROUP beside a sibling group — the preset Transforms shape. The sibling exists so
 *  the CT can compare the two group headings' painted type instead of asserting a px literal (F-8/R-4: the
 *  picker's heading came back as a 16px sentence-case white heading among 10.5px muted caps kickers). */
export function RegexPickerInDeckStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 720 }}>
        <QueryBoundary fallback={<p>loading…</p>} renderError={(error): ReactElement => <p role="alert">{String(error)}</p>}>
          <Stack gap="section">
            <Section kicker="Delivery">
              <Text voice="gloss">a sibling deck group</Text>
            </Section>
            <RegexScriptPicker scope={{ kind: "character", characterId: PICKER_CHARACTER }} heading="Regex" helperText="Rules this preset runs." />
          </Stack>
        </QueryBoundary>
      </div>
    </CtDataProviders>
  );
}

/** The picker as the WHOLE BODY of an already-named drill (the character facet) — no heading of its own,
 *  and the empty arm carrying its action (X-7 + X-19). */
export function RegexPickerHeadlessStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 720 }}>
        <QueryBoundary fallback={<p>loading…</p>} renderError={(error): ReactElement => <p role="alert">{String(error)}</p>}>
          <Section heading="Regex scripts">
            <RegexScriptPicker
              scope={{ kind: "character", characterId: PICKER_CHARACTER }}
              helperText="Rules that run whenever this character is in the room."
              onOpenLibrary={(): void => undefined}
            />
          </Section>
        </QueryBoundary>
      </div>
    </CtDataProviders>
  );
}

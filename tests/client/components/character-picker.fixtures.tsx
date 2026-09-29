// CT harness (not a spec — Playwright CT needs mounted components in their own module, and biome forbids
// exporting a component from a `.ct.tsx`). The shared `CharacterPicker` over the real data layer: its rows
// come from `character.list` (a keyset INFINITE query), stubbed at the network per test by routeTrpc.

import { CharacterPicker } from "@orb/client/components";
import type { CharacterId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import { useState } from "react";
import { CtDataProviders } from "../../support/browser/ct-data-providers.tsx";

export interface CharacterPickerHarnessProps {
  /** Override the list's default `max-h-80` geometry for pagination controls. */
  readonly listClassName?: string;
  /** Rows the consumer already owns and therefore must not offer again. */
  readonly excludeIds?: readonly CharacterId[];
}

/** The picker with a visible record of what it selected (the select seam is a prop, so the assertion is the
 *  rendered name, not a spy that cannot cross the CT boundary). `autoFocusSearch` lands the caret in the
 *  combobox so a test can drive keyboard navigation without a focus dance. */
export function CharacterPickerHarness({ listClassName, excludeIds }: CharacterPickerHarnessProps = {}): ReactElement {
  const [picked, setPicked] = useState<string | null>(null);
  return (
    // ONE root element: the mount root's component locator resolves to the first root node, so the picked
    // probe stays inside every component-scoped query.
    <CtDataProviders>
      <div style={{ width: 480 }}>
        <CharacterPicker
          autoFocusSearch={true}
          emptyText="No characters match."
          label="Pick a character"
          onSelect={(_id: CharacterId, name: string): void => setPicked(name)}
          placeholder="Search characters…"
          {...(excludeIds === undefined ? {} : { excludeIds })}
          {...(listClassName === undefined ? {} : { listClassName })}
        />
        <p data-testid="picked">{picked ?? ""}</p>
      </div>
    </CtDataProviders>
  );
}

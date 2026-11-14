import { CtIsolation } from "@orb/testkit/browser";
import { PortalContainerContext } from "@orb/ui/lib";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@orb/ui/menu";
import { Select } from "@orb/ui/select";
import type { ReactElement } from "react";
import { useId, useRef } from "react";

const ITEMS = [
  { value: "ash", label: "Ash" },
  { value: "birch", label: "Birch" },
];

/** A control that clears the 24px floor on its own, so only whatever covers it decides whether `target-size` reads it as a finding. */
function PlantedTarget({ label = "Planted target" }: { readonly label?: string }): ReactElement {
  return <button aria-label={label} style={{ blockSize: 32, inlineSize: 40 }} type="button" />;
}

/**
 * A menu whose open popup can be laid over the planted target; popup and page share one landmark, as the shell's popup layer does.
 * `withSecondRow` adds a second row (not the tabbable one) and a second target to lay under it.
 */
export function MenuOverTargetStory({ withSecondRow = false }: { readonly withSecondRow?: boolean }): ReactElement {
  const portal = useRef<HTMLElement>(null);
  return (
    <CtIsolation subject="Menu popup" isolates="What the target-size rule reports for a control an open popup covers">
      <PortalContainerContext value={portal}>
        <main ref={portal}>
          <h1>Menu popup</h1>
          <Menu>
            <MenuTrigger>Open the menu</MenuTrigger>
            <MenuPopup aria-label="Fixture menu">
              {/* The trailing space is where a planted target lies under the row, clear of its text. */}
              <MenuItem>
                Rename the character
                <span aria-hidden="true" style={{ display: "inline-block", inlineSize: 48 }} />
              </MenuItem>
              {withSecondRow ? (
                <MenuItem>
                  Delete the character
                  <span aria-hidden="true" style={{ display: "inline-block", inlineSize: 48 }} />
                </MenuItem>
              ) : null}
            </MenuPopup>
          </Menu>
          <PlantedTarget />
          {withSecondRow ? <PlantedTarget label="Second target" /> : null}
        </main>
      </PortalContainerContext>
    </CtIsolation>
  );
}

/**
 * A control whose name drops the words it shows, so it fails the house Label-in-Name check as well as the vendor rule.
 * `described` makes the whole shown text the control's own description: stripping it leaves no label to compare.
 */
export function DroppedWordsStory({ described = false }: { readonly described?: boolean }): ReactElement {
  const descriptionId = useId();
  return (
    <CtIsolation subject="Dropped shown words" isolates="What the label-content-name-mismatch rule reports for a control whose name lacks its shown words">
      <main>
        <h1>Dropped shown words</h1>
        <button aria-label="Save" type="button" {...(described ? { "aria-describedby": descriptionId } : {})}>
          <span id={descriptionId}>Discard the draft</span>
        </button>
      </main>
    </CtIsolation>
  );
}

/** A closed select whose trigger can be laid over the planted target, and a plain button that can too. */
export function ClosedCoverStory(): ReactElement {
  return (
    <CtIsolation subject="Select trigger and plain cover" isolates="What the target-size rule reports for a control no open popup covers">
      <Select aria-label="Pick" defaultValue="ash" items={ITEMS} />
      <button style={{ blockSize: 32, inlineSize: 40 }} type="button">
        Cover
      </button>
      <PlantedTarget />
    </CtIsolation>
  );
}

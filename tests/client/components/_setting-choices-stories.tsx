import { SettingCheckboxRow, SettingRowGroup, SettingTrackRow } from "@orb/client/components";
import { CtAppearanceChannels, CtIsolation } from "@orb/testkit/browser";
import { Checkbox } from "@orb/ui/checkbox";
import { Field } from "@orb/ui/field";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useState } from "react";

/** The production choice track with the Field states a bare export list cannot reach. */
export function SettingChoicesStory({
  width,
  showError = false,
  disabled = false,
}: {
  readonly width: number;
  readonly showError?: boolean;
  readonly disabled?: boolean;
}): ReactElement {
  const [archive, setArchive] = useState(true);
  const [images, setImages] = useState(true);
  const [chats, setChats] = useState(true);
  return (
    <CtIsolation subject="inline setting choices" isolates="Shared choice tracks, Field identity and rich selection states without feature reads">
      <CtAppearanceChannels settings={{}}>
        <Container className="m-section" style={{ inlineSize: width }}>
          <SettingRowGroup kind="choices">
            <SettingTrackRow>
              <Field
                label="Archive entries"
                orientation="inline"
                hint="Archive entries retain the source text."
                description="Keep the source entries alongside their extracted text in this archive."
                error={showError ? "Choose at least one available destination before continuing with this export." : undefined}
              >
                <Checkbox checked={archive} onCheckedChange={(next): void => setArchive(next === true)} />
              </Field>
            </SettingTrackRow>
            <SettingTrackRow>
              <SettingCheckboxRow
                label="Images"
                orientation="inline"
                checked={images}
                onChange={setImages}
                disabled={disabled}
                disabledReason={disabled ? "Finish indexing before changing this choice." : undefined}
              />
            </SettingTrackRow>
            <SettingTrackRow>
              <SettingCheckboxRow label="Plain selection" orientation="inline" checked={chats} onChange={setChats} />
            </SettingTrackRow>
          </SettingRowGroup>
        </Container>
      </CtAppearanceChannels>
    </CtIsolation>
  );
}

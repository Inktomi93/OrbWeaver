import { EditableTagChip } from "@orb/client/components";
import type { AppearanceSettings } from "@orb/contracts/settings/appearance";
import type { TagView } from "@orb/contracts/tag";
import { CtAppearanceChannels, CtClientProviders } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";

/** The shared default edit trigger and its real popover editor, with space around each hit target. */
export function EditableTagChipStory({ tags, appearance }: { readonly tags: readonly TagView[]; readonly appearance: AppearanceSettings }): ReactElement {
  return (
    <CtClientProviders>
      <CtAppearanceChannels settings={appearance}>
        <Stack gap="block" padding="section">
          <Button intent="ghost" size="sm">
            Before tags
          </Button>
          <Row gap="block">
            {tags.map((tag) => (
              <EditableTagChip key={tag.id} tag={tag} />
            ))}
          </Row>
        </Stack>
      </CtAppearanceChannels>
    </CtClientProviders>
  );
}

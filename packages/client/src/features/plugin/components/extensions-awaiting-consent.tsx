// The Plugin pages LIST's waiting group: one row per plugin standing on its owner's approval, under a counted
// label, shown whether or not any pages exist yet. A row picks THAT plugin's review into the CONTENT pane, so
// the approval on screen can only ever be for the plugin the person named.
//
// The status is quiet text, not a badge: a fresh install lands every seeded example here at once, and a column
// of accent pills drowned the one decision the group exists for.

import { Blocks, Icon } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Heading } from "@orb/ui/text";
import type { ReactElement } from "react";
import { selectPluginPageFromList, usePluginPageKey } from "#state";
import type { ExtensionsEmptyView } from "../hooks/use-extensions-empty.ts";
import { pluginReviewKey } from "../hooks/use-plugin-pages.ts";
import { extensionsWaitingGroupLabel } from "../lib/extensions-copy.ts";
import { NEEDS_APPROVAL_LABEL } from "../lib/plugin-copy.ts";

export interface ExtensionsAwaitingRowsProps {
  /** The plugins standing on the caller's consent — `useExtensionsEmpty`'s own rows, never a second read. */
  readonly plugins: ExtensionsEmptyView["awaitingPlugins"];
}

export function ExtensionsAwaitingRows({ plugins }: ExtensionsAwaitingRowsProps): ReactElement {
  const active = usePluginPageKey();
  return (
    <Stack gap="tight">
      <Heading level={2} voice="label">
        {extensionsWaitingGroupLabel(plugins.length)}
      </Heading>
      {plugins.map((plugin) => {
        const key = pluginReviewKey(plugin.id);
        return (
          <ListRow
            clickable={true}
            key={plugin.id}
            leading={<Icon icon={Blocks} size="sm" />}
            onClick={(): void => selectPluginPageFromList(key)}
            selected={key === active}
            subtitle={NEEDS_APPROVAL_LABEL}
            title={plugin.name}
          />
        );
      })}
    </Stack>
  );
}

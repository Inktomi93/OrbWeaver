// The "Customize this look" fold's CAPTION (#866 S4 / #297 — config-revamp-design.md §7.3): names what
// the folded knobs ride on ("advanced · your changes, on top of Hearth"). A COMPONENT, not a hook on the
// group def, so the config host renders it blind in its own fiber (the `useSearchRows` posture) and the
// current look's name is read cache-first — the Looks section above it already loaded both queries.

import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";

const HEARTH_NAME = "Hearth";

export function LooksFoldCaption(): ReactElement {
  const trpc = useTRPC();
  const { data: themes } = useQuery(trpc.settings.listThemes.queryOptions());
  const { data: settings } = useQuery(trpc.settings.getUserSettings.queryOptions());
  const selectedId = settings?.config.theme.selectedThemeId ?? null;
  const current = selectedId === null ? HEARTH_NAME : (themes?.find((theme) => theme.id === selectedId)?.name ?? HEARTH_NAME);
  return (
    <Text as="span" voice="gloss" className="truncate">
      {`advanced · your changes, on top of ${current}`}
    </Text>
  );
}

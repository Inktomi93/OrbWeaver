// The "Customize this look" fold's CAPTION (#866 S4 / #297): names what
// the folded knobs ride on ("advanced · your changes, on top of Hearth"). A COMPONENT, not a hook on the
// group def, so the config host renders it blind in its own fiber (the `useSearchRows` posture) and the
// current look's name is read cache-first — the Looks section above it already loaded both queries.
//
// THE NAME IS ALWAYS THE ROW'S OWN (#1671). No selection means the row the SERVER flags as default, read
// off the same collection every other name here comes from — never a mirrored "Hearth" literal, which is
// the #1667 defect (a rename on the server put a stale word in this sentence with every gate green). A
// dangling `selectedThemeId` lands on the same arm, which is what the seeder's heal and the shell's
// `use-selected-theme` already do with one. And because the read is a plain `useQuery`, the collection can
// still be in flight on a cold open: with no row to name, the caption drops its tail rather than inventing
// a look — the gloss stays true at every moment instead of true-once-loaded.

import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";

export function LooksFoldCaption(): ReactElement {
  const trpc = useTRPC();
  const { data: themes } = useQuery(trpc.settings.listThemes.queryOptions());
  const { data: settings } = useQuery(trpc.settings.getUserSettings.queryOptions());
  const selectedId = settings?.config.theme.selectedThemeId ?? null;
  const selected = selectedId === null ? undefined : themes?.find((theme) => theme.id === selectedId);
  const current = (selected ?? themes?.find((theme) => theme.isDefault))?.name;
  return (
    <Text as="span" voice="gloss" className="truncate">
      {current === undefined ? "advanced · your changes" : `advanced · your changes, on top of ${current}`}
    </Text>
  );
}

// The root channel name the production manifest declares for a setting, so a spec never spells a `data-appearance-*`
// attribute or `--appearance-*` property by hand. The manifest is read from its own file: it imports no component graph.
import { APPEARANCE_CHANNEL_ROWS } from "../../../packages/client/src/lib/appearance-carrier-manifest.ts";

type ChannelKey = (typeof APPEARANCE_CHANNEL_ROWS)[number]["key"];

export function channelName(key: ChannelKey): string {
  const row = APPEARANCE_CHANNEL_ROWS.find((candidate) => candidate.key === key);
  if (row === undefined) {
    throw new Error(`appearance.${key} declares no CSS channel`);
  }
  return row.name;
}

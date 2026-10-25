// The root channel name the production manifest declares for a setting, so a spec never spells a `data-appearance-*`
// attribute or `--appearance-*` property by hand.
import { APPEARANCE_CHANNEL_ROWS } from "@orb/client/lib";

type ChannelKey = (typeof APPEARANCE_CHANNEL_ROWS)[number]["key"];

export function channelName(key: ChannelKey): string {
  const row = APPEARANCE_CHANNEL_ROWS.find((candidate) => candidate.key === key);
  if (row === undefined) {
    throw new Error(`appearance.${key} declares no CSS channel`);
  }
  return row.name;
}

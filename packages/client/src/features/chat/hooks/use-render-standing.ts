import { useServedRenderPolicy, useSettingsViewerView } from "#data";
import type { ViewerRenderStanding } from "#lib";

/** What a plain-content notice reads beyond its row, or `undefined` until the install's render policy is read: until
 *  then no notice can say which setting holds the row. Read only where a notice mounts, so a transcript with no plain
 *  row asks for neither. */
export function useRenderStanding(): ViewerRenderStanding | undefined {
  const deployment = useServedRenderPolicy();
  const { isAdmin } = useSettingsViewerView();
  return deployment === undefined ? undefined : { deployment, isAdmin };
}

// tag feature CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test module). The story
// reaches a feature internal the front door doesn't re-export (the settings/workloads _ct-stories.tsx
// precedent) — TagsSettingsSurface is mounted by the settings host through `tagsPane`, not exported
// standalone.

import type { ReactElement } from "react";
import { TagsSettingsSurface } from "../../../../packages/client/src/features/tag/surfaces/tags-settings-surface";
import { CtDataProviders } from "../../../support/ct/ct-data-providers";

/** The real Tags settings pane (Task #65 — the tag-management screen) in isolation — `tag.listTagsWithUsage`
 *  (the read) plus the tag mutations (`updateTag`/`removeTag`/`mergeTags`/`setTagOrder`/`pruneUnusedTags`)
 *  are stubbed per-test via routeTrpc. */
export function TagsSettingsStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 900, overflow: "auto", width: 960 }}>
        <TagsSettingsSurface />
      </div>
    </CtDataProviders>
  );
}

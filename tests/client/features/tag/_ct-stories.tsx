// tag feature CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test module). The stories
// reach feature internals the front door doesn't re-export (the settings/workloads _ct-stories.tsx
// precedent): the tag collection's rows and member editor are mounted by the CONFIG host through
// `tagCollection`, never exported standalone.

import { QueryBoundary } from "@orb/client/data";
import type { ReactElement } from "react";
import { TagCollectionRows } from "../../../../packages/client/src/features/tag/components/tag-collection-rows";
import { TagMemberSurface } from "../../../../packages/client/src/features/tag/surfaces/tag-member-surface";
import { CtDataProviders } from "../../../support/ct/ct-data-providers";

/** The tag MEMBER EDITOR (the F-11 split's CONTENT half) in isolation — `tag.listTagsWithUsage` (the read)
 *  plus the tag mutations (`updateTag`/`removeTag`/`mergeTags`) are stubbed per-test via routeTrpc. The
 *  QueryBoundary is production's (the config host wraps `detail(view)` in one), not scaffolding: the
 *  surface reads through `useSuspenseQuery`. */
export function TagMemberStory({ memberId = "tag_adventure" }: { readonly memberId?: string }): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 720, overflow: "auto", width: 720 }}>
        <QueryBoundary fallback={<p>loading…</p>} renderError={(error): ReactElement => <p role="alert">{String(error)}</p>}>
          <TagMemberSurface memberId={memberId} />
        </QueryBoundary>
      </div>
    </CtDataProviders>
  );
}

/** The tag collection's ROWS (the LIST half) with the host's view pre-bound — for the row-anatomy and
 *  filter assertions that would otherwise be three components deep inside the host. */
export function TagCollectionRowsStory({ filter = "" }: { readonly filter?: string }): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 620, overflow: "auto", width: 330 }}>
        <QueryBoundary fallback={<p>loading…</p>} renderError={(error): ReactElement => <p role="alert">{String(error)}</p>}>
          <TagCollectionRows view={{ selectedId: null, onSelect: (): void => undefined, filter }} />
        </QueryBoundary>
      </div>
    </CtDataProviders>
  );
}

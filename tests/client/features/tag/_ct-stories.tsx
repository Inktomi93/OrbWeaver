// tag feature CT stories (core/Spine-Testing.md §7 — CT mounts ONLY from a non-test module). The stories
// reach feature internals the front door doesn't re-export (the settings/workloads _ct-stories.tsx
// precedent): the tag collection's rows and member editor are mounted by the CONFIG host through
// `tagCollection`, never exported standalone.

import { QueryBoundary } from "@orb/client/components";
import { setTagPruneConfirmOpen, setTagSortMode } from "@orb/client/state";
import type { ReactElement } from "react";
import { useState } from "react";
import { TagCollectionRows } from "../../../../packages/client/src/features/tag/components/tag-collection-rows.tsx";
import { TagMemberSurface } from "../../../../packages/client/src/features/tag/surfaces/tag-member-surface.tsx";
import { CtDataProviders } from "../../../support/browser/ct-data-providers.tsx";
import { CONTENT_COLUMN_NARROW_PANE, CONTENT_COLUMN_WIDE_PANE } from "../../../support/browser/measure-content-column.ts";

/** The tag MEMBER EDITOR (the F-11 split's CONTENT half) in isolation — `tag.listTagsWithUsage` (the read)
 *  plus the tag mutations (`updateTag`/`removeTag`/`mergeTags`) are stubbed per-test via routeTrpc. The
 *  QueryBoundary is production's (the config host wraps `detail(view)` in one), not scaffolding: the
 *  surface reads through `useSuspenseQuery`. */
export function TagMemberStory({ memberId = "tag_adventure", width = 720 }: { readonly memberId?: string; readonly width?: number }): ReactElement {
  return (
    <CtDataProviders>
      {/* `width` is FIXED, never content-sized: the colour readouts' one-line budget is a fact about the pane
          they land in, and a mount that grows to fit its content agrees with every overflow. */}
      <div style={{ height: 720, overflow: "auto", width }}>
        <QueryBoundary fallback={<p>loading…</p>} renderError={(error): ReactElement => <p role="alert">{String(error)}</p>}>
          {/* `library` is the host's own group label ("Tags", `tags-group.tsx`) — the drill row's exit says
              `Back to Tags`, exactly as the config host spells it (#1747). */}
          <TagMemberSurface view={{ library: "Tags", memberId }} />
        </QueryBoundary>
      </div>
    </CtDataProviders>
  );
}

/** The tag member editor at the two pane widths its CONTENT COLUMN behaves differently at (#1664): below
 *  the `@5xl` container step, where the column takes `--width-content-col` and centers, and above it,
 *  where it breathes to `--width-content-col-wide`. ONE mount, both arms — the widen button is the
 *  crossover, and a CT cannot resize its own fixed host any other way. The widths bracket the real panes
 *  measured on the shell (869px list-only · 1176px focus at 1280 · 1816px focus at 1920). */
export function TagMemberContentColumnStory(): ReactElement {
  const [width, setWidth] = useState(CONTENT_COLUMN_NARROW_PANE);
  return (
    <>
      <button onClick={(): void => setWidth(CONTENT_COLUMN_WIDE_PANE)} type="button">
        widen the pane
      </button>
      <TagMemberStory width={width} />
    </>
  );
}

/** The tag collection's ROWS with the host's view pre-bound — for the row-anatomy and filter assertions
 *  that would otherwise be three components deep inside the host.
 *
 *  THE HOST IS A FLEX COLUMN WITH A DEFINITE HEIGHT, and this box has to be one too (#1725). The rows'
 *  windowed arm takes its bounded height from its parent chain now (`min-h-0 flex-1` all the way up to
 *  CONTENT's own `overflow-y-auto` box) rather than from a 384px cap, so a story that mounted them in a
 *  plain block would give the `VirtualList` a flex-basis of 0 inside an auto-height column and render a
 *  ZERO-height scroller — a fixture disagreeing with the pane about the one property under test.
 *
 *  THE THREE SORT BUTTONS AND THE PRUNE BUTTON ARE THE HOST'S SEAM, drawn here as the CT's spelling of it
 *  (the `ConfigMobileListStory` `go mobile` precedent). Since #1725 the sort Select and the prune menu item
 *  are drawn by the CONFIG host from `tagCollection.sort` / `.actions`; both write exactly these store
 *  functions, and the config landing's own CT pins that they do. What is left for THIS file is what the
 *  rows do with the result, which is why the driver is the store rather than a re-mounted host. */
export function TagCollectionRowsStory({ filter = "", width = 330 }: { readonly filter?: string; readonly width?: number }): ReactElement {
  return (
    <CtDataProviders>
      <button onClick={(): void => setTagSortMode("used")} type="button">
        sort: most used
      </button>
      <button onClick={(): void => setTagSortMode("alpha")} type="button">
        sort: a-z
      </button>
      <button onClick={(): void => setTagSortMode("manual")} type="button">
        sort: manual
      </button>
      <button onClick={(): void => setTagPruneConfirmOpen(true)} type="button">
        open prune confirm
      </button>
      {/* `width` is the PANE the rows are asked to fill. 330 is the LIST-era column every landed pin was
          written against and stays the default; #1824's width matrix drives it to the real CONTENT widths
          (382 coarse · the crossover · 990 desktop), because a row's ink balance is a WIDTH property and a
          point measurement at one width proves nothing about the other end. */}
      <div style={{ display: "flex", flexDirection: "column", height: 620, overflow: "auto", width }}>
        <QueryBoundary fallback={<p>loading…</p>} renderError={(error): ReactElement => <p role="alert">{String(error)}</p>}>
          <TagCollectionRows view={{ selectedId: null, onSelect: (): void => undefined, filter }} />
        </QueryBoundary>
      </div>
    </CtDataProviders>
  );
}

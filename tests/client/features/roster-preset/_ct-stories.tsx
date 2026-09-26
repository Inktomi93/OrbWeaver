// Story module for the saved-roster CTs (Spine-Testing §7 — CT mounts ONLY from a non-test module; this
// module exports COMPONENTS ONLY, playwright-ct rewrites named imports into component consts). The picker
// body suspends on `rosterPreset.list` (routed at the network by the `.ct.tsx`), so the stories wrap it in
// the PRODUCTION QueryBoundary exactly as the modal definition does (`lib/saved-rosters-modal.tsx`).
//
// THREE MOUNTS, because the surfaces answer to three different premises:
//   · `RosterPickerStory` — the LIBRARY plane (no room open): the chat-scoped affordances stay off. Its
//     `width` is a real production mount, not a convenience: the saved-rosters dialog measures 366px at
//     430×932 and its rows 316px, and the row's narrow-width collapse (side-eye 2026-08-29 P1-1) is
//     invisible at the 480px desktop story (a content-sized mount agrees with the bug).
//   · `RosterPickerHostStory` — a room open that the viewer HOSTS: "Save this room's roster" + its include-line
//     (whose loading/error/zero arms the `.ct.tsx` drives through `trpcHold`/`trpcError`) and the
//     "Add to this chat" door's report.
//   · `RosterMemberEditorStory` — the library editor (`surfaces/roster-member-surface.tsx`).
//   · `HomeRostersTileStory` — the Home "Rosters" tile, mounted through the REAL home frame so its
//     `useVisible` gate and its heading are the shipped ones.
//   · `RosterCollectionRowsStory` — the CONFIG COLLECTION's rows (`components/roster-collection-rows.tsx`),
//     which are a different surface from the picker's: same library, drawn into the CONTENT pane by the
//     config host, and therefore measured at PANE widths (#1838's ink-void matrix).
// `notify` is main.tsx-bound in production, so every story binds it to a DOM sink: the apply doors report
// through `notify`, and a toast that is never rendered is exactly the defect P1-2 filed.

import { QueryBoundary } from "@orb/client/components";
import { SkeletonRows, useTRPC } from "@orb/client/data";
import { HomeSurface } from "@orb/client/features/home";
import type { NotifyInput } from "@orb/client/lib";
import { bindNotify, createContributorRegistry, toNotice } from "@orb/client/lib";
import type { HomeTileContribution } from "@orb/client/state";
import { selectChat } from "@orb/client/state";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { RosterCollectionRows } from "../../../../packages/client/src/features/roster-preset/components/roster-collection-rows.tsx";
import { RosterPicker } from "../../../../packages/client/src/features/roster-preset/components/roster-picker.tsx";
import { rosterPresetHomeTile } from "../../../../packages/client/src/features/roster-preset/lib/home-rosters-tile.tsx";
import { RosterMemberSurface } from "../../../../packages/client/src/features/roster-preset/surfaces/roster-member-surface.tsx";
import { CtDataProviders } from "../../../support/browser/ct-data-providers.tsx";
import { CONTENT_COLUMN_NARROW_PANE, CONTENT_COLUMN_WIDE_PANE } from "../../../support/browser/measure-content-column.ts";

// The stories' active-chat id — the `.ct.tsx` stubs `chat.getChat`/`automation.listRules` for this same id
// (a plain module-const, not an export: a story module exports components ONLY).
const HOST_CHAT_ID = castId<ChatId>("chat_roster_ct");

/** The DOM sink for `notify` — the picker's apply doors report through it, and `bindNotify` is main.tsx's
 *  in production, so a CT that does not bind observes silence whether or not the code speaks. */
function useNoticeSink(): { readonly notice: string; readonly node: ReactElement } {
  const [notice, setNotice] = useState<string>("");
  useState(() => {
    const sink = (input: NotifyInput): void => {
      const parsed = toNotice(input);
      setNotice(parsed.description === undefined ? parsed.title : `${parsed.title} ${parsed.description}`);
    };
    bindNotify({ error: sink, info: sink, success: sink, warn: sink });
    return null;
  });
  return { notice, node: <p data-testid="cbcf-notice">{notice}</p> };
}

/** The LIBRARY plane (no room open). `width` is the mount box — 480 is the desktop dialog, 316 the row's
 *  real width inside the 430×932 coarse-pointer dialog (see the header). */
export function RosterPickerStory({ width = 480 }: { readonly width?: number } = {}): ReactElement {
  const sink = useNoticeSink();
  return (
    <CtDataProviders>
      {/* A FIXED-width container (the narrowest-mount rule): the mount root is content-sized and would
          simply grow, which is the reading that agrees with the bug. */}
      <div style={{ width }}>
        <QueryBoundary fallback={<SkeletonRows count={4} shape="avatar-row" />}>
          <RosterPicker />
        </QueryBoundary>
      </div>
      {sink.node}
    </CtDataProviders>
  );
}

/** The picker with a HOSTED room open — the save door, its include-line arms, and "Add to this chat". */
export function RosterPickerHostStory({ width = 480 }: { readonly width?: number } = {}): ReactElement {
  const sink = useNoticeSink();
  useState(() => {
    selectChat(HOST_CHAT_ID);
    return null;
  });
  return (
    <CtDataProviders>
      <div style={{ width }}>
        <QueryBoundary fallback={<SkeletonRows count={4} shape="avatar-row" />}>
          <RosterPicker />
        </QueryBoundary>
      </div>
      {sink.node}
    </CtDataProviders>
  );
}

/** The editor with a SECOND WRITER — the roster row is refetched (and comes back renamed) while the host
 *  has the editor open (#1561). The row cannot express this by itself: `rosterPreset.get` is a suspending
 *  read, so the arrival has to be an INVALIDATION driven from outside, which is what this button is. The
 *  `.ct.tsx` flips its own route responder before pressing it. */
export function RosterMemberEditorTwoWritersStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 480 }}>
        <QueryBoundary fallback={<SkeletonRows count={4} shape="avatar-row" />}>
          <RosterMemberSurface view={{ library: "Rosters", memberId: "roster_preset_ct_a" }} />
        </QueryBoundary>
        <RosterArrival />
      </div>
    </CtDataProviders>
  );
}

/** The arrival trigger, INSIDE the providers — `useTRPC`/`useQueryClient` resolve against the CT's own
 *  singletons only from under them, which is why this is its own component rather than a line above. */
function RosterArrival(): ReactElement {
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  return (
    <button onClick={(): void => void queryClient.invalidateQueries(trpc.rosterPreset.get.pathFilter())} type="button">
      arrive rename
    </button>
  );
}

/** The roster COLLECTION's rows, as the config host mounts them (`components/roster-collection-rows.tsx`)
 *  — the #1838 subject, suspending on `rosterPreset.list`.
 *
 *  `width` is the PANE the rows are asked to fill and it is the point of the story: since #1725 these rows
 *  live in the CONTENT pane, so their ink balance is a WIDTH property. The default is the desktop pane; the
 *  CT's matrix drives it across `INK_VOID_WIDTHS`. A content-sized mount root would simply grow and agree
 *  with the bug, so the box is FIXED (the narrowest-real-mount rule). */
export function RosterCollectionRowsStory({ filter = "", width = 990 }: { readonly filter?: string; readonly width?: number } = {}): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ display: "flex", flexDirection: "column", height: 620, overflow: "auto", width }}>
        <QueryBoundary fallback={<SkeletonRows count={3} shape="avatar-row" />}>
          <RosterCollectionRows view={{ selectedId: null, onSelect: (): void => undefined, filter }} />
        </QueryBoundary>
      </div>
    </CtDataProviders>
  );
}

/** The library's roster EDITOR (`surfaces/roster-member-surface.tsx`) — suspends on `rosterPreset.get`. */
export function RosterMemberEditorStory({
  memberId = "roster_preset_ct_a",
  width = 480,
}: {
  readonly memberId?: string;
  /** The host pane's width — the CONTENT COLUMN's behaviour is a function of it (#1664). */
  readonly width?: number;
} = {}): ReactElement {
  const sink = useNoticeSink();
  return (
    <CtDataProviders>
      <div style={{ width }}>
        <QueryBoundary fallback={<SkeletonRows count={4} shape="avatar-row" />}>
          {/* `library` is the host's own group label (`roster-group.tsx`) — the drill exit (#1747). */}
          <RosterMemberSurface view={{ library: "Rosters", memberId }} />
        </QueryBoundary>
      </div>
      {sink.node}
    </CtDataProviders>
  );
}

/** The roster member editor at the two pane widths its CONTENT COLUMN behaves differently at (#1664) —
 *  the tag editor's twin story carries the argument. ONE mount, both arms: the widen button is the `@5xl`
 *  crossover a CT cannot otherwise reach on a fixed host. */
export function RosterMemberContentColumnStory(): ReactElement {
  const [width, setWidth] = useState(CONTENT_COLUMN_NARROW_PANE);
  return (
    <>
      <button onClick={(): void => setWidth(CONTENT_COLUMN_WIDE_PANE)} type="button">
        widen the pane
      </button>
      <RosterMemberEditorStory width={width} />
    </>
  );
}

/** The Home "Rosters" tile alone in the real home frame. `width` is the pane: 360 is the phone column. */
export function HomeRostersTileStory({ width = 360 }: { readonly width?: number } = {}): ReactElement {
  const sink = useNoticeSink();
  return (
    <CtDataProviders>
      <div style={{ width }}>
        <HomeSurface onNewChat={(): void => undefined} tiles={createContributorRegistry<HomeTileContribution>("home-tiles", [rosterPresetHomeTile])} />
      </div>
      {sink.node}
    </CtDataProviders>
  );
}

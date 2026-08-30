// Story module for the saved-cast CTs (Spine-Testing §7 — CT mounts ONLY from a non-test module; this
// module exports COMPONENTS ONLY, playwright-ct rewrites named imports into component consts). The picker
// body suspends on `rosterPreset.list` (routed at the network by the `.ct.tsx`), so the stories wrap it in
// the PRODUCTION QueryBoundary exactly as the modal definition does (`lib/saved-casts-modal.tsx`).
//
// THREE MOUNTS, because the surfaces answer to three different premises:
//   · `CastPickerStory` — the LIBRARY plane (no room open): the chat-scoped affordances stay off. Its
//     `width` is a real production mount, not a convenience: the saved-casts dialog measures 366px at
//     430×932 and its rows 316px, and the row's narrow-width collapse (side-eye 2026-08-29 P1-1) is
//     invisible at the 480px desktop story (a content-sized mount agrees with the bug).
//   · `CastPickerHostStory` — a room open that the viewer HOSTS: "Save current cast" + its include-line
//     (whose loading/error/zero arms the `.ct.tsx` drives through `trpcHold`/`trpcError`) and the
//     "Add to this chat" door's report.
//   · `CastMemberEditorStory` — the library editor (`surfaces/cast-member-surface.tsx`).
// `notify` is main.tsx-bound in production, so every story binds it to a DOM sink: the apply doors report
// through `notify`, and a toast that is never rendered is exactly the defect P1-2 filed.

import { QueryBoundary, SkeletonRows } from "@orb/client/data";
import type { NotifyInput } from "@orb/client/lib";
import { bindNotify, toNotice } from "@orb/client/lib";
import { selectChat } from "@orb/client/state";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import { useState } from "react";
import { CastPicker } from "../../../../packages/client/src/features/roster-preset/components/cast-picker.tsx";
import { CastMemberSurface } from "../../../../packages/client/src/features/roster-preset/surfaces/cast-member-surface.tsx";
import { CtDataProviders } from "../../../support/ct/ct-data-providers.tsx";

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
export function CastPickerStory({ width = 480 }: { readonly width?: number } = {}): ReactElement {
  const sink = useNoticeSink();
  return (
    <CtDataProviders>
      {/* A FIXED-width container (the narrowest-mount rule): the mount root is content-sized and would
          simply grow, which is the reading that agrees with the bug. */}
      <div style={{ width }}>
        <QueryBoundary fallback={<SkeletonRows count={4} shape="avatar-row" />}>
          <CastPicker />
        </QueryBoundary>
      </div>
      {sink.node}
    </CtDataProviders>
  );
}

/** The picker with a HOSTED room open — the save door, its include-line arms, and "Add to this chat". */
export function CastPickerHostStory({ width = 480 }: { readonly width?: number } = {}): ReactElement {
  const sink = useNoticeSink();
  useState(() => {
    selectChat(HOST_CHAT_ID);
    return null;
  });
  return (
    <CtDataProviders>
      <div style={{ width }}>
        <QueryBoundary fallback={<SkeletonRows count={4} shape="avatar-row" />}>
          <CastPicker />
        </QueryBoundary>
      </div>
      {sink.node}
    </CtDataProviders>
  );
}

/** The library's cast EDITOR (`surfaces/cast-member-surface.tsx`) — suspends on `rosterPreset.get`. */
export function CastMemberEditorStory({ memberId = "roster_preset_ct_a" }: { readonly memberId?: string } = {}): ReactElement {
  const sink = useNoticeSink();
  return (
    <CtDataProviders>
      <div style={{ width: 480 }}>
        <QueryBoundary fallback={<SkeletonRows count={4} shape="avatar-row" />}>
          <CastMemberSurface view={{ memberId }} />
        </QueryBoundary>
      </div>
      {sink.node}
    </CtDataProviders>
  );
}

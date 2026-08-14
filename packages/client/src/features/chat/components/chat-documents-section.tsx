// The per-chat DOCUMENTS rack — "what feeds this room", and the D85 host visibility toggle
// (databank-surface-spec §3.2/§6.3; the workboard item this lane exists to close).
//
// ONE COMPONENT, TWO DATA SHAPES, NO SEPARATE MEMBER MODE (`no-separate-reduced-modes`).
// `databank.listActiveForChat` is member-readable by design — the active documents are ROOM-PUBLIC prompt
// context every member's turns assemble against — and the VERB does the branching: a HOST receives the
// whole union with per-document `hidden` flags, a MEMBER receives only the visible subset and never learns
// a host-hidden document's NAME. So a member renders the identical section with the identical rows; the
// host's rows additionally carry the visibility control, the hidden skin and the detach. Nothing here
// counts what a member can't see (that would leak the count) and nothing renders a disabled control.
//
// THE SOURCE CHIP IS THE CORRECTION OVER LEGACY (§6.3). Legacy rendered a globally-attached document as
// `<Switch checked readOnly>` — a control that looks operable, is not, and whose real write lives in
// another section of the app. But a member's Everywhere document CANNOT be detached by the host, only
// hidden; a switch lies about that and a chip states it. `sources` (the D-2 server delta this lane landed)
// is what makes the chip possible, and it is the same datum that decides whether the row offers a detach.
//
// THE VISIBILITY TOGGLE IS A RETRIEVAL SWITCH, NOT A DELETE (D85). Hiding leaves every junction row
// intact — every label here says "feed"/"stop feeding", never "remove".

import type { ChatId, DocumentId } from "@orb/kit/ids";
import { formatBytes } from "@orb/kit/strings";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Eye, EyeOff, Icon, Unlink } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { MenuItem } from "@orb/ui/menu";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import { Fragment, useState } from "react";
import { RowActionsMenu, RowToggleAction } from "#components";
import type { Trpc } from "#data";
import { useInvalidation, useTRPC } from "#data";
import { useDetachDocumentFromChat, useSetChatDocumentVisibility } from "../hooks/use-chat-document-mutations.ts";
import { isDetachableFromChat, nextHiddenSet, sourceChips } from "../lib/chat-documents-model.ts";
import { AddChatDocumentDialog } from "./add-chat-document-dialog.tsx";

/** One row of the rack — DERIVED from the read's wire type, never re-spelled (§5.4). */
type ActiveDocument = inferOutput<Trpc["databank"]["listActiveForChat"]>[number];

export interface ChatDocumentsSectionProps {
  readonly chatId: ChatId;
  readonly isHost: boolean;
}

/** The "Documents" section body — the chat's active document union, one row each. */
export function ChatDocumentsSection({ chatId, isHost }: ChatDocumentsSectionProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const setVisibility = useSetChatDocumentVisibility({ trpc, invalidation });
  const detach = useDetachDocumentFromChat({ trpc, invalidation });
  const [pickerOpen, setPickerOpen] = useState(false);
  const { data: rows } = useSuspenseQuery(trpc.databank.listActiveForChat.queryOptions({ chatId }));

  const setHidden = (id: DocumentId, hide: boolean): void => {
    // The write REPLACES the whole excluded set, so it is derived from every rendered row, not patched.
    setVisibility.mutate({ chatId, visibility: { hidden: nextHiddenSet(rows, id, hide) } });
  };

  return (
    <Stack gap="block">
      <Text voice="gloss">
        {isHost
          ? "Indexed passages from these documents can be pulled into this chat's prompts. Hiding one stops it feeding this room — it stays attached everywhere else."
          : "Indexed passages from these documents can be pulled into this chat's prompts — anyone in the room can contribute their own."}
      </Text>

      {rows.length === 0 ? (
        // Never render nothing: "nothing feeds this room" is the normal starting state, and a blank block
        // reads as a failed load (empty states are load-bearing).
        <Text voice="gloss">
          {isHost
            ? "No documents feed this chat yet."
            : "No documents feed this chat yet — switch one of your own on for every chat in Databank and it joins the rooms you are in."}
        </Text>
      ) : (
        // THE RACK OWNS ITS SCROLL. The union is membership-derived: every present member's Everywhere
        // documents plus the roster characters' plus the room's own, so it can outgrow the pane while its
        // siblings (Field overrides, Macro picks, the host band) cannot. Without a cap of its own a
        // twenty-document room pushed every later section below the fold of the tab's scroller.
        // `overscroll-contain` keeps a flick inside the rack from chaining into the tab behind it.
        <Stack className="relative max-h-96 overflow-y-auto overscroll-contain" gap="tight">
          {rows.map((row) => (
            <ActiveDocumentRow
              document={row}
              isHost={isHost}
              key={row.id}
              onDetach={(): void => detach.mutate({ chatId, documentId: row.id })}
              onSetHidden={(hide): void => setHidden(row.id, hide)}
            />
          ))}
        </Stack>
      )}

      {isHost ? (
        <>
          <Button intent="secondary" onClick={(): void => setPickerOpen(true)} size="sm" type="button">
            Add from your bank
          </Button>
          <AddChatDocumentDialog activeIds={rows.map((row) => row.id)} chatId={chatId} onOpenChange={setPickerOpen} open={pickerOpen} />
        </>
      ) : null}
    </Stack>
  );
}

interface ActiveDocumentRowProps {
  readonly document: ActiveDocument;
  readonly isHost: boolean;
  readonly onSetHidden: (hide: boolean) => void;
  readonly onDetach: () => void;
}

/** One active document. Leading is EMPTY (§6.1's ruling — a variable-width leading chip costs ~58px of
 *  title at the 320px pane floor); the provenance chips ride the HEAD OF THE SUBTITLE line, where the slack
 *  is, and the size is the row's scent. Chunk counts are library detail — the rack answers "what feeds this
 *  room", so it drops them. */
function ActiveDocumentRow({ document, isHost, onSetHidden, onDetach }: ActiveDocumentRowProps): ReactElement {
  const chips = sourceChips(document.sources);
  const detachable = isDetachableFromChat(document.sources);
  // `hidden` is only ever true in a HOST's payload (the verb filters a member's), so the muted skin and the
  // spoken "Hidden" chip are host-only by construction rather than by a second permission test.
  const visible = !document.hidden;

  return (
    <ListRow
      // A MEMBER's row renders NO trailing cluster at all — not a disabled one (permission-OMIT; a control
      // a member cannot operate is exactly the affordance lie this rack exists to correct).
      {...(isHost
        ? {
            actions: (
              <>
                <RowToggleAction
                  // Eye ↔ EyeOff is a SHAPE delta, so the state is legible in greyscale (WCAG 1.4.1)
                  // without a pressed tint. `rest="always"`: retrieval state is exactly what the eye
                  // scans this rack for, so it must not be hover-revealed.
                  icon={visible ? Eye : EyeOff}
                  labelOff={`Let ${document.name} feed this chat again`}
                  labelOn={`Stop ${document.name} feeding this chat`}
                  onToggle={(): void => onSetHidden(visible)}
                  pressed={visible}
                  rest="always"
                />
                {detachable ? (
                  <RowActionsMenu label={`Actions for ${document.name}`}>
                    <MenuItem onClick={onDetach}>
                      <Icon icon={Unlink} size="sm" />
                      Detach from this chat
                    </MenuItem>
                  </RowActionsMenu>
                ) : (
                  // A RESERVED, aria-hidden slot where the kebab would be (the `LibraryRow.clusterSpacers`
                  // rule, applied to a raw ListRow): only SOME rows are detachable, so without it the eye —
                  // the column a host scans this rack down — lands at two different x's row to row. Empty
                  // and aria-hidden: this is layout, never a disabled affordance.
                  <Row aria-hidden={true} className="size-control-md shrink-0" />
                )}
              </>
            ),
          }
        : {})}
      className={visible ? "" : "opacity-60"}
      subtitle={formatBytes(document.byteSize)}
      // EVERY chip is followed by a literal space text node. Visual spacing is `mr-field`, but the
      // accessible-DESCRIPTION computation concatenates adjacent inline nodes with no separator (the same
      // trap `ListRow` documents for its own subtitleLead↔subtitle seam) — without these, a screen reader
      // heard "EverywhereThis chat 24.5 KB". Measured in the browser, not theorized.
      subtitleLead={
        <>
          {/* Said in WORDS, not only by the dimmed skin + the eye glyph: a host scanning the rack for what
              is switched off should not have to read an icon's pressed state to find it. */}
          {visible ? null : (
            <>
              <Badge className="mr-field" intent="warning" size="inline" tone="soft">
                Hidden
              </Badge>{" "}
            </>
          )}
          {chips.map((chip) => (
            <Fragment key={chip}>
              <Badge className="mr-field" intent="neutral" size="inline" tone="soft">
                {chip}
              </Badge>{" "}
            </Fragment>
          ))}
        </>
      }
      title={document.name}
    />
  );
}

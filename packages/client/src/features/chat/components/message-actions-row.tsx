// The per-message action cluster: Edit / Fork inline, with Hide-from-AI / Copy / View-wire-trace / Delete
// under a ⋯ menu (D66 A3 collapse — north-star ui-cohesion §4 N3). Only a canon row renders it (the streaming
// row is a separate component with no actions). Edit/Hide/Fork apply only to user/assistant rows — a system row
// is a room notice, not authored prose. This row does not re-derive author-or-host authority client-side; a
// caller without permission gets the verb's own NOT_FOUND. Edit doesn't mutate here — it only flips the
// external edit-draft store's mode. The whole cluster's rest/reveal posture is `messageActionsRevealClass`
// (one home); the ⋯ arm is the sanctioned `RowActionsMenu` composite, which owns Delete's ConfirmDialog.
//
// WIREBTN (owner nit, 2026-08-03) — "View wire trace…" LIVES HERE, not on the metadata row. RAWVIEW grafted
// the host-only per-variant wire trigger onto `MessageMetadataRow` because that was the only per-VARIANT
// surface built at the time; the result was a lone quiet button under every message, outside the row-action
// grammar (D62 §12 — the kebab IS the action home). It is an action on this reply, so it is a menu item.
//
// WHY THE DIALOG IS A SIBLING OF THE MENU, NOT A CHILD: `MenuPopup` portals through `BaseMenu.Portal` with no
// `keepMounted`, and a `MenuItem` click closes the menu — a dialog rendered inside the popup would unmount in
// the same tick it was asked to open. `RowActionsMenu` already solves exactly this for its destructive item
// (the item is a child, the `ConfirmDialog` is a sibling); the wire viewer follows that precedent, which is
// also why the `open` state has to live in THIS component rather than in a split-out trigger file.
//
// THREE RATIFIED SECOND DOORS HANG OFF THIS ROW (#568 — the duplicate-action-doors budgets
// `chats::chat.deleteMessages: 2`, `chats::chat.undoContinue: 2`, `chats::chat.revertContinue: 2`). This is
// the per-MESSAGE plane; each twin is a different plane with a different reach, so none is the #539 echo
// class (two controls in one home, one carrying a strict subset of the other's payload):
//   • deleteMessages ← `message-selection-bar.tsx`: bulk-select mode, the whole selected SET, a counted
//     confirm. This door deletes ONE row at rest, with no mode to enter first.
//   • undoContinue / revertContinue ← `use-composer-utilities.ts` (the ✨ menu): composer-side and pinned to
//     the TAIL assistant slot. This door is the only one that reaches a reply which is no longer the tail —
//     which is precisely why the item is phase-gated per row (`hasContinuation`) rather than tail-derived.
// The budgets stay COUNTS rather than `EXEMPT_PROCEDURES` rows on purpose: an exempt procedure leaves the
// gate's census, so a THIRD door would land silently — and a third door on any of these three is the drift
// the budget exists to red on.

import type { MessageView } from "@orb/contracts/chat";
import type { ChatId, MessageId } from "@orb/kit/ids";
import { modelDisplayName } from "@orb/kit/model-name";
import { Button } from "@orb/ui/button";
import { Code, Copy, Cpu, Eye, EyeOff, GitFork, Icon, Pencil, Redo2, SmilePlus, Undo2 } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { MenuItem } from "@orb/ui/menu";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { HIDE_AT_COARSE, ROW_ACTION_INLINE, RowActionsMenu } from "#components";
import { createEntityMutation, useInvalidation, useTRPC } from "#data";
import { cn, copyWithNotice, NEEDS_CONTINUATION, notify, testId } from "#lib";
import { startEditingMessage } from "#state";
import { useReactionsEnabled, useReactionsForVariant, useViewerSeatId } from "../hooks/use-message-reactions.ts";
import { MESSAGE_ACTIONS_MENU_NAME, MESSAGE_EDIT_NAME, MESSAGE_FORK_NAME, MESSAGE_REACTION_ADD_NAME } from "../lib/message-action-names.ts";
import { MESSAGE_ACTION_ICON_CLASS, messageActionsRevealClass } from "../lib/message-actions-reveal.ts";
import { RowReactionPicker } from "./row-reaction-picker.tsx";
import { VariantWireViewer } from "./variant-wire-viewer.tsx";

// A failed copy's next step; the message is on screen right above the menu.
const MESSAGE_COPY_FALLBACK = "Select the message text to copy it by hand.";

interface HideVars {
  readonly chatId: ChatId;
  readonly messageId: MessageId;
  readonly hidden: boolean;
}

interface DeleteVars {
  readonly chatId: ChatId;
  readonly messageIds: MessageId[];
}

interface ForkVars {
  readonly chatId: ChatId;
  readonly throughSeq: number;
}

interface ContinueRestoreVars {
  readonly chatId: ChatId;
  readonly messageId: MessageId;
}

const useHideMutation = createEntityMutation<HideVars, unknown>({
  options: (trpc) => trpc.chat.setMessageHidden.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't change that message's visibility.",
});

const useDeleteMutation = createEntityMutation<DeleteVars, unknown>({
  options: (trpc) => trpc.chat.deleteMessages.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't delete that message.",
});

const useForkMutation = createEntityMutation<ForkVars, { chat: { id: ChatId } }>({
  options: (trpc) => trpc.chat.forkChat.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't fork this chat.",
});

// Undo/revert the last continuation on THIS reply's shown swipe (F2). Bus-driven like the other row
// mutations — the verb emits `messageCommitted`, the surface refetches; no manual cache write here.
const useUndoContinueMutation = createEntityMutation<ContinueRestoreVars, unknown>({
  options: (trpc) => trpc.chat.undoContinue.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't undo the continuation.",
});

const useRevertContinueMutation = createEntityMutation<ContinueRestoreVars, unknown>({
  options: (trpc) => trpc.chat.revertContinue.mutationOptions(),
  busDriven: true,
  errorToast: "Couldn't re-apply the continuation.",
});

function isEditableRole(role: MessageView["role"]): boolean {
  return role === "user" || role === "assistant";
}

/** The undo/revert phase-gate's disabled reason (absent snapshot ⇒ the "continue this reply first" title).
 *  Hoisted out of the component body for the cognitive-complexity budget only. */
function continueRestoreReasonFor(hasContinuation: boolean): string | undefined {
  return hasContinuation ? undefined : NEEDS_CONTINUATION;
}

/** Wire-trace applicability (see the in-component comment) — hoisted for the complexity budget only. */
function showWireTraceFor(viewerIsHost: boolean, role: MessageView["role"]): boolean {
  return viewerIsHost && role === "assistant";
}

export interface MessageActionsRowProps {
  readonly message: MessageView;
  /** Optional — a caller without it still forks + notifies, just doesn't switch the active chat. */
  readonly onChatForked?: ((chatId: ChatId) => void) | undefined;
  readonly messageActions?: "expanded" | "hover" | undefined;
  /** B7/MR3 — the room's PRESENT CHARACTER-NAME set (`speakerThemesByName`'s keys, threaded from the row). The
   *  picker's segment-target list parses the CANON body with these under the narrator-voice gate — the
   *  identical inputs the server's write validation uses, so a picked index survives the round trip.
   *  Absent ⇒ `[]` ⇒ only `<speaker>`-tagged bodies offer segment targets. */
  readonly characterNames?: readonly string[] | undefined;
  /** WIREBTN — the viewer holds the room HOST role (`ChatDetail.viewerIsHost`). Gates "View wire trace…":
   *  `chat.getVariantWire` is `requireHost` server-side, so a member is never offered an item that would only
   *  ever refuse — and is never told the plane exists. Absent ⇒ NOT host (fail-closed: a caller that forgets
   *  to thread it hides the item rather than exposing it). The server gate is the AUTHORITY; this is UX. */
  readonly viewerIsHost?: boolean | undefined;
  /** #167 — the raw model identifier to credit this reply to, or null/absent for no credit. Already gated
   *  by the `showModelIcon` appearance toggle by the row; this component only decides how it PRINTS. */
  readonly modelCredit?: string | null | undefined;
}

/** THE MODEL CREDIT (#167, owner rulings 2026-08-18). It used to be a datum in the metadata row, printed as
 *  the RAW identifier — which for a self-hosted engine is a 106-character absolute weights path, and which
 *  sat under every single reply at 1.59:1 over background art (measured live, the owner's room). It is an
 *  attribution about the reply, not a fact the reader came for, so it belongs in the row's reveal cluster
 *  with the other per-message affordances: nothing at rest, name on hover / keyboard focus-within (the
 *  cluster's own `messageActionsRevealClass` posture — no new tab stop, no tooltip, no fake button).
 *
 *  THEN THE TEXT ITSELF WENT (second ruling, same day, verbatim-adjacent): "we have our model icon with
 *  model name on hover, but we ALSO have a long-ass raw model name text — the latter is ugly and needs to
 *  go." Moving the string into the reveal cluster made it quieter; it did not make it not-a-string. The
 *  ONE rendering is the GLYPH; the name lives on `title` (pointer) and in an sr-only sentence (AT). The
 *  earlier ruling's shape is intact — same slot, same `showModelIcon` gate, same cluster — only its text
 *  node is gone, so this is a narrowing of #167 rather than a reversal of it.
 *
 *  Keeps the `message-metadata-model` slot on this semantically-equivalent element (rule 0.7).
 *
 *  #220 — IT STANDS DOWN AT A COARSE POINTER, and that is #167's own ruling carried through rather than an
 *  exception to it. The credit's whole posture is "nothing at rest, name on hover"; at a touch pointer
 *  there is no hover, so `REVEAL_AT_COARSE` was printing it permanently — a rest-visible weights string in
 *  the middle of the name band (measured centre-stage on --mobile, with the speaker's own name down to 65px
 *  and three wrapped lines). It is a DATUM, not a verb, so it takes `HIDE_AT_COARSE` (a plain drop) rather
 *  than an overflow twin: there is no action to move into the menu, and a menu item that only states a
 *  string would be a fake affordance. The datum stays reachable on any fine pointer and, for a host, in
 *  the kebab's wire trace. */
function renderModelCredit(model: string | null | undefined): ReactElement | null {
  if (model === null || model === undefined || model.trim() === "") {
    return null;
  }
  const shown = modelDisplayName(model);
  return (
    <Text
      as="span"
      voice="gloss"
      className={cn("inline-flex items-center", HIDE_AT_COARSE)}
      data-slot="message-metadata-model"
      // THE NAME LIVES ON HOVER NOW, UNCONDITIONALLY. #167 put it on `title` only when the derivation
      // shortened the identifier (the #115 stutter rule): with the string also printed, a title that
      // repeated it verbatim was noise. The printed string is gone, so `title` is the ONLY door the name
      // has and it is always open. The DERIVED name, not the raw identifier — the 106-character weights
      // path is exactly what the owner ruled out of the transcript; a host who needs the exact identity
      // has the kebab's wire trace.
      title={shown}
    >
      {/* THE GLYPH IS THE WHOLE RENDERING (owner ruling, 2026-08-18): "we have our model icon with model
          name on hover, but we ALSO have a long-ass raw model name text — the latter is ugly and needs to
          go." The visible `{shown}` span is DELETED here, at the transcript's one model-text site (swept:
          `pnpm ast refs modelDisplayName` — every other caller is outside the transcript, in
          credentials/preset/refinery/stats). The datum is not lost, it has two doors that are not rest
          text: `title` above for a pointer, and the sr-only lead below for AT — which is why the glyph
          carries `aria-hidden` and the sentence carries the name. */}
      <Icon aria-hidden={true} className={MESSAGE_ACTION_ICON_CLASS} icon={Cpu} size="sm" />
      <Text as="span" className="sr-only">
        Generated by {shown}
      </Text>
    </Text>
  );
}

export function MessageActionsRow({
  message,
  onChatForked,
  messageActions,
  viewerIsHost = false,
  modelCredit,
  characterNames = [],
}: MessageActionsRowProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const hide = useHideMutation({ trpc, invalidation });
  const remove = useDeleteMutation({ trpc, invalidation });
  const fork = useForkMutation({ trpc, invalidation });
  const undoContinue = useUndoContinueMutation({ trpc, invalidation });
  const revertContinue = useRevertContinueMutation({ trpc, invalidation });
  const [wireOpen, setWireOpen] = useState(false);
  // B6 — the reaction picker's open state lives HERE, beside `wireOpen`, for the reason that comment block
  // gives: a `MenuItem` click closes the menu, so a popup rendered inside the popup would unmount in the
  // same tick it was asked to open. Both doors below set this one flag.
  const [pickerOpen, setPickerOpen] = useState(false);
  const reactionGroups = useReactionsForVariant(message.chatId, message.selectedVariantId);
  const viewerSeatId = useViewerSeatId(message.chatId);
  // B7 — the room's RESOLVED reactions posture (room value ?? the HOST's per-user default, resolved
  // server-side on the listReactions read). OFF removes BOTH picker doors — APPLICABILITY, not a phase
  // gate (the `showWireTrace` class): the host turned the plane off, so "Add a reaction" is not a verb
  // this room has, and the server refuses it anyway (`reactions_disabled`). The pill rows self-hide the
  // same way (the read answers zero groups).
  const reactionsEnabled = useReactionsEnabled(message.chatId);
  const clusterRef = useRef<HTMLDivElement | null>(null);

  const { chatId, id: messageId, role, content, excludedFromPrompt, hasContinuation } = message;
  const editable = isEditableRole(role);
  // Undo/revert target the continue snapshot, which only assistant replies carry. Phase-gated on the shown
  // swipe's snapshot presence (`hasContinuation`) — disabled-with-reason when absent, NEVER hidden (owner:
  // no reduced menus). Both stay enabled once a continuation exists (the snapshot is retained across an undo,
  // so revert re-applies it); the row simply toggles between the pre-continue and continued text.
  const showContinueRestore = role === "assistant";
  const continueRestoreReason = continueRestoreReasonFor(hasContinuation);
  // A row whose shown swipe cannot HAVE a prompt gets no item at all: a `user` row is authored, never
  // generated (its variant's `promptSnapshot` is null by construction), and a `system` row is a room notice.
  // Absence here is a real answer — the assistant replies that DID generate are exactly the ones a host asks
  // "what did this send?" about. Not a disabled-with-reason item: this is APPLICABILITY, not a phase gate.
  const showWireTrace = showWireTraceFor(viewerIsHost, role);

  // #245 — MEASURE THE ROW'S FOOTPRINT HERE, in the click handler, because this is the last moment it
  // exists: React has already committed the read→edit swap by the time any effect runs, and a render-time
  // ref read is illegal (react-hooks/refs). THIS click is the one frame where the read-mode box is still on
  // screen.
  //
  // The measured box is the CONTENT COLUMN, not the bubble. Everything edit mode removes or replaces lives
  // inside it — the action cluster (suppressed by this very row), the metadata row, the tool records, the
  // swipe pager, and the prose the editor stands in for — and the column is content-sized, so losing any of
  // them shrinks it. Measured on the shared-track stage: a two-word reply's column went 221px → 114px
  // (bubble skin) and 221px → 138px plus a 42px sideways slide (flat).
  // Measured off the CLUSTER's own node, not the clicked control: the coarse arm's door is a `MenuItem`
  // inside a PORTALLED popup, which has no ancestor column to walk up to. This element is inside the
  // column at every pointer, so both doors reserve the same box.
  const onEdit = (): void => {
    const column = clusterRef.current?.closest('[data-slot="message-content-column"]') ?? null;
    const width = column === null ? 0 : column.getBoundingClientRect().width;
    startEditingMessage(messageId, content, width > 0 ? width : null);
  };

  const onToggleHidden = (): void => {
    if (hide.isPending) {
      return;
    }
    hide.mutate({ chatId, messageId, hidden: !excludedFromPrompt });
  };

  const onDelete = (): void => {
    if (remove.isPending) {
      return;
    }
    remove.mutate({ chatId, messageIds: [messageId] });
  };

  const onFork = async (): Promise<void> => {
    if (fork.isPending) {
      return;
    }
    // @orb-waive caught-failure-ownership(catch): the fork mutation's sticky error + global errorToast already surfaced the failure. Ends if the mutation drops its errorToast.
    try {
      const result = await fork.mutateAsync({ chatId, throughSeq: message.seq });
      onChatForked?.(result.chat.id);
      notify.success("Forked to a new chat.");
    } catch {
      // The sticky mutation error + the global errorToast already surfaced the failure.
    }
  };

  const onUndoContinue = (): void => {
    if (undoContinue.isPending || !hasContinuation) {
      return;
    }
    undoContinue.mutate({ chatId, messageId });
  };

  const onRevertContinue = (): void => {
    if (revertContinue.isPending || !hasContinuation) {
      return;
    }
    revertContinue.mutate({ chatId, messageId });
  };

  return (
    <Row ref={clusterRef} gap="field" align="center" justify="end" data-slot="message-actions-row" className={messageActionsRevealClass(messageActions)}>
      {renderModelCredit(modelCredit)}
      {editable ? (
        // #220 THE COARSE COLLAPSE (row-reveal.ts). At a touch pointer `REVEAL_AT_COARSE` pins this whole
        // cluster ON, and every icon button is a ≥44px box by token construction — measured on --mobile,
        // the pair plus the ⋯ plus the credit held 297px of a 407px band and left the speaker's name 65px,
        // wrapped to three lines. Both verbs ride the ⋯ menu below at EVERY pointer (the chats row's
        // mirror-parity ruling: one item, never a coarse-only twin), so the collapse costs one tap and
        // nothing leaves the a11y tree.
        <Row align="center" className={ROW_ACTION_INLINE}>
          <Button intent="ghost" size="icon" aria-label={MESSAGE_EDIT_NAME} onClick={onEdit}>
            <Icon className={MESSAGE_ACTION_ICON_CLASS} icon={Pencil} size="sm" />
          </Button>
          <Button intent="ghost" size="icon" loading={fork.isPending} aria-label={MESSAGE_FORK_NAME} onClick={(): void => void onFork()}>
            <Icon className={MESSAGE_ACTION_ICON_CLASS} icon={GitFork} size="sm" />
          </Button>
        </Row>
      ) : null}
      {/* B6 — the FINE door. `ROW_ACTION_INLINE` stands it down at a coarse pointer, where its `MenuItem`
          twin below is the one door (the #220 coarse collapse, exactly as Edit/Fork use it). Present on
          EVERY committed row, not only editable ones: reacting to a system notice is legal and harmless,
          and the applicability question a reaction asks ("is this canon?") is already answered by the row
          being rendered at all. Ordered AFTER the Edit/Fork primary actions (#786, owner ruling): a row's
          roving Tab stop must reach "Edit message" before "Add a reaction". */}
      {reactionsEnabled ? (
        <Button aria-label={MESSAGE_REACTION_ADD_NAME} className={ROW_ACTION_INLINE} intent="ghost" onClick={(): void => setPickerOpen(true)} size="icon">
          <Icon className={MESSAGE_ACTION_ICON_CLASS} icon={SmilePlus} size="sm" />
        </Button>
      ) : null}
      <RowActionsMenu
        label={MESSAGE_ACTIONS_MENU_NAME}
        destructive={{
          title: "Delete this message?",
          description: "This can't be undone.",
          confirmLabel: "Delete",
          onConfirm: onDelete,
        }}
      >
        {/* The collapsed pair's one door. Present at BOTH pointers by the mirror-parity ruling
            (chat-list-row-menu.tsx) — a `ROW_ACTION_OVERFLOW` twin here would put a verb in the menu
            twice on touch and nowhere on desktop the moment the inline arm is ever reworked. */}
        {editable ? (
          <MenuItem onClick={onEdit}>
            <Icon icon={Pencil} size="sm" />
            Edit message
          </MenuItem>
        ) : null}
        {editable ? (
          <MenuItem onClick={(): void => void onFork()}>
            <Icon icon={GitFork} size="sm" />
            Fork chat here
          </MenuItem>
        ) : null}
        {editable ? (
          <MenuItem onClick={onToggleHidden}>
            <Icon icon={excludedFromPrompt ? EyeOff : Eye} size="sm" />
            {excludedFromPrompt ? "Unhide from AI" : "Hide from AI"}
          </MenuItem>
        ) : null}
        {/* B6 — the COARSE door, and by the mirror-parity ruling it is present at EVERY pointer (a
            coarse-only twin would put the verb in the menu on touch and nowhere on desktop the moment the
            inline arm is reworked — the same argument the Edit/Fork items above carry). B7: gone entirely
            when the room's reactions posture resolves OFF — applicability, mirroring the inline door. */}
        {reactionsEnabled ? (
          <MenuItem onClick={(): void => setPickerOpen(true)}>
            <Icon icon={SmilePlus} size="sm" />
            Add a reaction
          </MenuItem>
        ) : null}
        <MenuItem onClick={(): void => copyWithNotice(content, MESSAGE_COPY_FALLBACK)}>
          <Icon icon={Copy} size="sm" />
          Copy
        </MenuItem>
        {/* The continue undo/redo pair (F2) — only on an assistant reply (the sole role that carries a
            continue snapshot), disabled-with-reason until a continue has run on the shown swipe. */}
        {showContinueRestore ? (
          <MenuItem disabled={!hasContinuation} title={continueRestoreReason} onClick={onUndoContinue}>
            <Icon icon={Undo2} size="sm" />
            Undo last continuation
          </MenuItem>
        ) : null}
        {showContinueRestore ? (
          <MenuItem disabled={!hasContinuation} title={continueRestoreReason} onClick={onRevertContinue}>
            <Icon icon={Redo2} size="sm" />
            Re-apply continuation
          </MenuItem>
        ) : null}
        {showWireTrace ? (
          <MenuItem data-testid={testId("variantWireTrigger")} onClick={(): void => setWireOpen(true)}>
            <Icon icon={Code} size="sm" />
            View wire trace…
          </MenuItem>
        ) : null}
      </RowActionsMenu>
      {/* Mounted only once opened — an unopened row builds no query key and no dialog subtree (the viewer's
          own read is `enabled: open`, so this is belt-and-braces on the same gate). */}
      {wireOpen ? <VariantWireViewer chatId={chatId} variantId={message.selectedVariantId} open={wireOpen} onOpenChange={setWireOpen} /> : null}
      {/* Same mount discipline as the wire viewer: an unopened row builds no picker subtree (the picker
          wiring itself — the canon parse + the segment claim — lives in `row-reaction-picker.tsx`). */}
      {pickerOpen ? (
        <RowReactionPicker characterNames={characterNames} groups={reactionGroups} message={message} onOpenChange={setPickerOpen} viewerSeatId={viewerSeatId} />
      ) : null}
    </Row>
  );
}

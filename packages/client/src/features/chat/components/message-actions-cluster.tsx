// The inline action cluster both rows draw, and the streaming row's hidden footprint of it.

import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { GitFork, Icon, Pencil, SmilePlus } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import type { ReactElement, ReactNode } from "react";
import { ROW_ACTION_INLINE, RowActionsMenu } from "#components";
import { useReactionsEnabled } from "../hooks/use-message-reactions.ts";
import { MESSAGE_ACTIONS_MENU_NAME, MESSAGE_EDIT_NAME, MESSAGE_FORK_NAME, MESSAGE_REACTION_ADD_NAME } from "../lib/message-action-names.ts";
import { MESSAGE_ACTION_ICON_CLASS } from "../lib/message-actions-reveal.ts";
import { GenerationCreditGlyph } from "./generation-credit.tsx";

// The footprint is inert and hidden; its handlers never run.
const INERT = (): void => undefined;

export interface MessageActionsClusterProps {
  /** The generation credit, already gated on `showModelIcon`. */
  readonly credit: ReactNode;
  readonly editable: boolean;
  readonly reactionsEnabled: boolean;
  readonly forkPending?: boolean;
  readonly onEdit: () => void;
  readonly onFork: () => void;
  readonly onReact: () => void;
  readonly onDelete?: () => void;
  readonly menuItems?: ReactNode;
}

/** The inline cluster both rows draw: the settled row wires it to real handlers, the streaming row's footprint to
 *  inert ones, so the footprint cannot drift from the buttons it reserves room for. Without `onDelete` the ⋯ menu
 *  carries no destructive item, which leaves its trigger unchanged. */
export function MessageActionsCluster({
  credit,
  editable,
  reactionsEnabled,
  forkPending = false,
  onEdit,
  onFork,
  onReact,
  onDelete,
  menuItems,
}: MessageActionsClusterProps): ReactElement {
  return (
    <>
      {credit}
      {/* EDIT IS THE ONE INLINE VERB AT EVERY POINTER. At a touch pointer the bar holds Edit plus the ⋯ and
          nothing else, so it stays one compact line beside the name; Fork and Add a reaction stand down into
          the ⋯ there (`ROW_ACTION_INLINE`), where every verb also lives at every pointer (mirror parity). */}
      {editable ? (
        <>
          <Button intent="ghost" size="glyph-lg" shape="pill" aria-label={MESSAGE_EDIT_NAME} onClick={onEdit}>
            <Icon className={MESSAGE_ACTION_ICON_CLASS} icon={Pencil} size="sm" />
          </Button>
          <Button
            intent="ghost"
            size="glyph-lg"
            shape="pill"
            className={ROW_ACTION_INLINE}
            loading={forkPending}
            aria-label={MESSAGE_FORK_NAME}
            onClick={onFork}
          >
            <Icon className={MESSAGE_ACTION_ICON_CLASS} icon={GitFork} size="sm" />
          </Button>
        </>
      ) : null}
      {/* B6 — the FINE door. `ROW_ACTION_INLINE` stands it down at a coarse pointer, where its `MenuItem`
          twin below is the one door (the #220 coarse collapse, exactly as Fork uses it). Present on
          EVERY committed row, not only editable ones: reacting to a system notice is legal and harmless,
          and the applicability question a reaction asks ("is this canon?") is already answered by the row
          being rendered at all. Ordered AFTER the Edit/Fork primary actions (#786, owner ruling): a row's
          roving Tab stop must reach "Edit message" before "Add a reaction". */}
      {reactionsEnabled ? (
        <Button aria-label={MESSAGE_REACTION_ADD_NAME} className={ROW_ACTION_INLINE} intent="ghost" onClick={onReact} shape="pill" size="glyph-lg">
          <Icon className={MESSAGE_ACTION_ICON_CLASS} icon={SmilePlus} size="sm" />
        </Button>
      ) : null}
      <RowActionsMenu
        label={MESSAGE_ACTIONS_MENU_NAME}
        triggerSize="glyph"
        shape="pill"
        {...(onDelete === undefined
          ? {}
          : { destructive: { title: "Delete this message?", description: "This can't be undone.", confirmLabel: "Delete", onConfirm: onDelete } })}
      >
        {menuItems}
      </RowActionsMenu>
    </>
  );
}

/** The streaming row's stand-in for the action cluster: the same cluster, hidden and inert. A settled card is as
 *  wide as its header, actions included, so the streaming card reserves that footprint and a short reply does not
 *  reflow when it commits. A parity CT holds the two rows to the same boxes. */
export function GhostActionsFootprint({
  chatId,
  surface,
  generationCredit,
}: {
  readonly chatId: ChatId;
  readonly surface: string;
  readonly generationCredit: boolean;
}): ReactElement {
  const reactionsEnabled = useReactionsEnabled(chatId);
  return (
    <Row aria-hidden="true" align="center" className={`invisible ${surface}`} data-slot="message-actions-footprint" gap="glyph" inert={true} justify="end">
      <MessageActionsCluster
        credit={generationCredit ? <GenerationCreditGlyph slot="message-actions-footprint-credit" /> : null}
        editable={true}
        reactionsEnabled={reactionsEnabled}
        onEdit={INERT}
        onFork={INERT}
        onReact={INERT}
      />
    </Row>
  );
}

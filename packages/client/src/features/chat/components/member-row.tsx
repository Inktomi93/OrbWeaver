// One MEMBERS-panel row SHELL (FINAL-Chat-Tab-Redesign §7.1 — the BINDING row-interaction contract).
// The row BODY is ONE focusable unit — a full-width ghost `Button` that IS the `@orb/ui/menu` trigger,
// so Enter/Space/click/row-tap all open the per-row Menu (the canonical action home — the items live
// in member-row-menu.tsx) and Base UI returns focus to the row on close. The ContextMenu key routes
// through the same trigger (`onContextMenu` → `.click()`); the trailing ⋯ button and the fine-pointer
// inline shortcut cluster are `tabIndex={-1}` SIBLINGS (one tab stop per row — the panel's roving
// tabindex owns the rest), and the inline cluster DUPLICATES two Menu items with identical
// labels/icons, revealed on hover/`:focus-within` at a FINE pointer only (`pointer-fine:` — at coarse
// it never renders; the ≥44px-floor touch path is row-tap → Menu).
//
// Accessible name = identity + state (lib/member-rows.ts `rowAccessibleName`); the cast "responding…"
// mark is `aria-hidden` visually (a quiet pulse, never `aria-live` — no per-turn SR chatter) and rides
// the row's accessible DESCRIPTION instead. Destructive rows (Kick…/Leave…) sit LAST behind an
// AlertDialog (`ConfirmDialog`); a kick additionally reports itself to the panel
// (`onRequestRemovalFocus`) so focus lands on a neighbor when the bus echo removes the row.

import { blobUrl } from "@orb/contracts/assets";
import { initialsFor } from "@orb/kit/initials";
import { Avatar } from "@orb/ui/avatar";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Crown, Icon, MoreHorizontal, Volume2, VolumeX, Zap } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Menu, MenuPopup, MenuTrigger } from "@orb/ui/menu";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useId, useRef, useState } from "react";
import { ConfirmDialog } from "#components";
import type { MemberCastRow, MemberPersonRow, MemberRowActions, MemberRowFocusProps } from "../lib/member-rows";
import { rowAccessibleName } from "../lib/member-rows";
import { buildMenuItems } from "./member-row-menu";
import { TalkativenessPopover } from "./talkativeness-popover";

export interface MemberRowProps extends MemberRowFocusProps, MemberRowActions {
  readonly row: MemberPersonRow | MemberCastRow;
}

/** One Members row: the focusable body (menu trigger) · fine-pointer inline shortcuts · weight chip ·
 *  the trailing ⋯ · the per-row Menu + confirms. */
export function MemberRow(props: MemberRowProps): ReactElement {
  const { row, tabIndex, registerRef, onRowFocus } = props;
  const bodyRef = useRef<HTMLButtonElement | null>(null);
  const descriptionId = useId();
  const [confirm, setConfirm] = useState<"kick" | "leave" | null>(null);
  const [weightOpen, setWeightOpen] = useState(false);

  const menuItems = buildMenuItems(props, { setConfirm, openWeight: () => setWeightOpen(true) });
  const hasMenu = menuItems.length > 0;
  const responding = row.kind === "cast" && row.responding;

  const body = (
    <Button
      intent="ghost"
      size="md"
      tabIndex={tabIndex}
      aria-label={rowAccessibleName(row)}
      {...(responding ? { "aria-describedby": descriptionId } : {})}
      className="min-w-0 flex-1 justify-start"
      ref={(el: HTMLButtonElement | null): void => {
        bodyRef.current = el;
        registerRef(row.key, el);
      }}
      onFocus={(): void => onRowFocus(row.key)}
      onContextMenu={(event): void => {
        // The ContextMenu key / right-click opens the same canonical Menu (§7.1).
        event.preventDefault();
        if (hasMenu) {
          bodyRef.current?.click();
        }
      }}
    >
      <Avatar
        size="sm"
        fallbackDelay={0}
        // Hue-seed: character id for cast (matches transcript/library); participant id for a human seat.
        hueSeed={row.kind === "cast" ? row.characterId : row.key}
        {...(row.avatarHash === null ? {} : { src: blobUrl(row.avatarHash) })}
      >
        {initialsFor(row.displayName)}
      </Avatar>
      <Text as="span" size="label" weight="medium" tone={row.kind === "cast" && row.disabled ? "muted" : undefined} className="min-w-0 truncate">
        {row.displayName}
        {row.kind === "person" && row.handle !== null ? ` · ${row.handle}` : ""}
      </Text>
      <RowStateBadges row={row} />
      {responding ? (
        <>
          {/* Visual mark aria-hidden; the state rides the accessible DESCRIPTION (no aria-live). */}
          <Text as="span" size="micro" tone="muted" aria-hidden={true} className="animate-pulse">
            responding…
          </Text>
          <Text as="span" id={descriptionId} className="sr-only">
            responding
          </Text>
        </>
      ) : null}
    </Button>
  );

  return (
    <Row gap="field" align="center" className="group/member" data-slot="member-row">
      {hasMenu ? (
        <Menu>
          <MenuTrigger render={body} />
          <MenuPopup>{menuItems}</MenuPopup>
        </Menu>
      ) : (
        body
      )}

      {row.kind === "cast" ? <CastInlineCluster row={row} actions={props} /> : null}

      {/* The talkativeness weight chip — the glance readout AND the anchored popover's trigger (§7.1:
          "Talkativeness… opens an anchored popover with the labeled slider"). Menu item + chip both
          open it; pointer users can tap the chip directly. */}
      {row.kind === "cast" && props.onSetTalkativeness !== undefined ? (
        <TalkativenessPopover row={row} open={weightOpen} onOpenChange={setWeightOpen} onSetTalkativeness={props.onSetTalkativeness} />
      ) : null}

      {/* The ⋯ affordance — a pointer shortcut into the SAME canonical Menu (tabIndex -1: the row body
          is the one tab stop; keyboard users open the menu with Enter/Space on the row). */}
      {hasMenu ? (
        <Button
          type="button"
          intent="ghost"
          size="icon"
          tabIndex={-1}
          aria-label={`Actions for ${row.displayName}`}
          onClick={(): void => bodyRef.current?.click()}
        >
          <Icon icon={MoreHorizontal} size="sm" />
        </Button>
      ) : null}

      {row.kind === "person" ? <PersonRowConfirms row={row} actions={props} confirm={confirm} setConfirm={setConfirm} /> : null}
    </Row>
  );
}

/** The quiet state chips beside the name: host crown · "you" · pending nomination · muted. */
function RowStateBadges({ row }: { readonly row: MemberPersonRow | MemberCastRow }): ReactElement | null {
  if (row.kind === "cast") {
    return row.disabled ? (
      <Badge size="sm" intent="neutral">
        Muted
      </Badge>
    ) : null;
  }
  return (
    <>
      {row.isHost ? (
        <Badge size="sm">
          <Icon icon={Crown} size="xs" />
          Host
        </Badge>
      ) : null}
      {row.isViewer ? (
        <Badge size="sm" intent="neutral">
          you
        </Badge>
      ) : null}
      {row.pendingNominee ? (
        <Badge size="sm" intent="info">
          Nominated
        </Badge>
      ) : null}
    </>
  );
}

/** Fine-pointer inline shortcut cluster (mute · force-turn) — duplicates two Menu items with identical
 *  labels/icons; NEVER rendered at a coarse pointer (§7.1: row tap opens the Menu there). */
function CastInlineCluster({ row, actions }: { readonly row: MemberCastRow; readonly actions: MemberRowActions }): ReactElement | null {
  if (actions.onSetDisabled === undefined) {
    return null;
  }
  const setDisabled = actions.onSetDisabled;
  return (
    <Row gap="field" align="center" className="hidden pointer-fine:group-focus-within/member:flex pointer-fine:group-hover/member:flex">
      <Button
        type="button"
        intent="ghost"
        size="icon"
        tabIndex={-1}
        aria-pressed={row.disabled}
        aria-label={row.disabled ? `Unmute ${row.displayName}` : `Mute ${row.displayName}`}
        onClick={(): void => setDisabled(row.characterId, !row.disabled)}
      >
        <Icon icon={row.disabled ? VolumeX : Volume2} size="sm" />
      </Button>
      {actions.onForceTurn === undefined ? null : (
        <Button
          type="button"
          intent="ghost"
          size="icon"
          tabIndex={-1}
          aria-label={`Make ${row.displayName} speak next`}
          onClick={(): void => actions.onForceTurn?.(row.characterId)}
        >
          <Icon icon={Zap} size="sm" />
        </Button>
      )}
    </Row>
  );
}

/** Destructive confirms — AlertDialog, never an undo-toast (FINAL-Chats §11 rule 8). */
function PersonRowConfirms({
  row,
  actions,
  confirm,
  setConfirm,
}: {
  readonly row: MemberPersonRow;
  readonly actions: MemberRowActions;
  readonly confirm: "kick" | "leave" | null;
  readonly setConfirm: (c: "kick" | "leave" | null) => void;
}): ReactElement {
  return (
    <>
      <ConfirmDialog
        open={confirm === "kick"}
        onOpenChange={(next): void => setConfirm(next ? "kick" : null)}
        title={`Remove ${row.displayName}?`}
        description="They lose access to this chat. Their messages stay in the transcript."
        confirmLabel="Remove"
        onConfirm={(): void => {
          actions.onRequestRemovalFocus?.(row.key);
          actions.onKick?.(row.userId);
          setConfirm(null);
        }}
      />
      <ConfirmDialog
        open={confirm === "leave"}
        onOpenChange={(next): void => setConfirm(next ? "leave" : null)}
        title="Leave this chat?"
        description={
          actions.leaveArchivesRoom === true
            ? "You're the host — leaving archives this chat for everyone."
            : "You'll lose access until someone invites you again. Your messages stay."
        }
        confirmLabel="Leave"
        onConfirm={(): void => {
          actions.onLeave?.();
          setConfirm(null);
        }}
      />
    </>
  );
}

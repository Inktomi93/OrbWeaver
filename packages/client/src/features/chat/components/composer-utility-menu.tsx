// The composer's ✨ UTILITY menu (W-D) — the NON-guided message tools split out of the guided cluster to
// keep each file under the component-size cap: Recover input (recall the last FIRED steer — the D57 ring,
// NOT unfired-draft recovery, owner-clarified) · Corrections (the rewrite/OOC dialog) · Undo/Revert
// continuation · Clear input · Simple send (chat.commitMessage — post without generating). Each item is the
// omit-doctrine's disabled-affordance law: rendered enabled, or disabled-with-a-legible-reason, never hidden.

import { Button } from "@orb/ui/button";
import type { LucideIcon } from "@orb/ui/icons";
import { Eraser, Icon, Pencil, Redo2, Undo2, WandSparkles } from "@orb/ui/icons";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuSubmenuRoot, MenuSubmenuTrigger, MenuTrigger } from "@orb/ui/menu";
import type { ReactElement } from "react";
import { SWIPE_NEEDS_REPLY, testId } from "#lib";
import { useRecentSteers } from "#state";

export interface UtilityMenuProps {
  readonly hasText: boolean;
  readonly canTargetTail: boolean;
  readonly canUndoRevert: boolean;
  readonly onRewrite: () => void;
  readonly onRecall: (steer: string) => void;
  readonly onUndo: (() => void) | undefined;
  readonly onRevert: (() => void) | undefined;
  readonly onClear: (() => void) | undefined;
  readonly onSimpleSend: (() => void) | undefined;
}

export function UtilityMenu(props: UtilityMenuProps): ReactElement {
  const { hasText, canTargetTail, canUndoRevert, onRewrite, onRecall, onUndo, onRevert, onClear, onSimpleSend } = props;
  const recentSteers = useRecentSteers();
  return (
    <Menu>
      <MenuTrigger
        aria-label="Message tools"
        data-testid={testId("composerUtility")}
        render={
          <Button type="button" intent="ghost" size="icon" title="Message tools" className="shrink-0 rounded-full">
            <Icon icon={WandSparkles} size="sm" />
          </Button>
        }
      />
      <MenuPopup>
        {/* Recover input = recall the LAST steer you fired (owner-clarified — the D57 fired-steer ring, NOT
            unfired-draft recovery). Disabled with a reason when the ring is empty (nothing to recover yet). */}
        {recentSteers.length > 0 ? (
          <RecoverInputSubmenu steers={recentSteers} onRecall={onRecall} />
        ) : (
          <MenuItem disabled={true} title="Fire a guided action first — then you can recall it">
            Recover input
          </MenuItem>
        )}
        <MenuItem disabled={!canTargetTail} title={canTargetTail ? undefined : SWIPE_NEEDS_REPLY} onClick={canTargetTail ? onRewrite : undefined}>
          <Icon icon={Pencil} size="sm" />
          Corrections…
        </MenuItem>
        <MenuSeparator />
        <UtilityActionItem
          icon={Undo2}
          label="Undo continuation"
          onAction={onUndo}
          enabled={onUndo !== undefined && canUndoRevert}
          disabledReason="Continue a reply first — nothing to undo yet"
        />
        <UtilityActionItem
          icon={Redo2}
          label="Revert continuation"
          onAction={onRevert}
          enabled={onRevert !== undefined && canUndoRevert}
          disabledReason="Continue a reply first — nothing to revert yet"
        />
        <MenuSeparator />
        <UtilityActionItem
          icon={Eraser}
          label="Clear input"
          onAction={onClear}
          enabled={onClear !== undefined}
          disabledReason="The composer is already empty"
        />
        <UtilityActionItem
          label="Simple send"
          onAction={onSimpleSend}
          enabled={onSimpleSend !== undefined}
          disabledReason={hasText ? "Send your first message normally, then Simple send is available" : "Type a message to post"}
        />
      </MenuPopup>
    </Menu>
  );
}

/** One enabled-or-disabled-with-reason utility item (the omit-doctrine's disabled-affordance law). */
function UtilityActionItem({
  icon,
  label,
  onAction,
  enabled,
  disabledReason,
}: {
  readonly icon?: LucideIcon;
  readonly label: string;
  readonly onAction: (() => void) | undefined;
  readonly enabled: boolean;
  readonly disabledReason: string;
}): ReactElement {
  return (
    <MenuItem disabled={!enabled} title={enabled ? undefined : disabledReason} onClick={enabled ? onAction : undefined}>
      {icon !== undefined ? <Icon icon={icon} size="sm" /> : null}
      {label}
    </MenuItem>
  );
}

/** Recall a fired steer back into the composer (the D57 ring). The ring is DE-DUPED on push
 *  (`pushFiredSteer` filters an exact repeat to the front), so each steer string is unique — a content key
 *  is collision-free (the old wand's `key={steer}` collision defect is gone once the ring dedupes). Truncated. */
function RecoverInputSubmenu({ steers, onRecall }: { readonly steers: readonly string[]; readonly onRecall: (steer: string) => void }): ReactElement {
  return (
    <MenuSubmenuRoot>
      <MenuSubmenuTrigger>Recover input</MenuSubmenuTrigger>
      <MenuPopup>
        {steers.map((steer) => (
          <MenuItem key={steer} title={steer} onClick={(): void => onRecall(steer)} className="max-w-xs truncate">
            {steer}
          </MenuItem>
        ))}
      </MenuPopup>
    </MenuSubmenuRoot>
  );
}

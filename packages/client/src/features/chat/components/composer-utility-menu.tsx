// The composer's ✨ UTILITY menu (wand v2) — everything BUSY lives here so the composer's top row is just the
// four guided icons + this ✨ trigger. Holds: Recover input (recall the last FIRED steer — the D57 ring, NOT
// unfired-draft recovery, owner-clarified) · Corrections (the rewrite/OOC dialog) · Undo/Revert continuation ·
// Clear input · Simple send (chat.commitMessage — post without generating) · Regenerate (a PLAIN reroll of the
// tail assistant — owner: "regenerate goes inside magic wand menu") · the P5 game steers (owner: "game steers
// go in the magic wand") · the IMAGE controls (attach + generate-from-text — owner: image things into the menu).
// Each item is the omit-doctrine's disabled-affordance law: rendered enabled, or disabled-with-a-legible-reason,
// never hidden.

import type { GuidedGameSteerKind } from "@orb/kit/guided";
import { RPG_PLOT_STEER_KINDS, RPG_PLOT_STEERS } from "@orb/kit/guided";
import { Button } from "@orb/ui/button";
import type { FileDropzoneResult } from "@orb/ui/file-dropzone";
import { FileDropzone } from "@orb/ui/file-dropzone";
import type { LucideIcon } from "@orb/ui/icons";
import { Compass, Eraser, Icon, ImagePlus, ListOrdered, Pencil, Redo2, RotateCcw, Sparkles, Undo2, WandSparkles } from "@orb/ui/icons";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuSubmenuRoot, MenuSubmenuTrigger, MenuTrigger } from "@orb/ui/menu";
import type { ReactElement } from "react";
import { SWIPE_NEEDS_REPLY, testId } from "#lib";
import { useRecentSteers } from "#state";

/** The image controls re-homed into the ✨ utility menu (owner) — attach + generate-from-text. Owned by the
 *  composer (upload caps, the generate hook, the F-P1 clear-on-success); the wand only renders them. Homed
 *  HERE (the menu that renders them) so the cluster imports it DOWN this one edge — no import cycle. */
export interface ComposerImageControls {
  readonly maxAttachmentBytes: number;
  readonly uploadDisabled: boolean;
  readonly onAddFiles: (result: FileDropzoneResult) => void;
  readonly canGenerate: boolean;
  readonly generateReason: string | undefined;
  readonly generating: boolean;
  readonly onGenerate: () => void;
}

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
  /** Plain reroll of the tail assistant (no steer) — disabled-with-reason unless a tail assistant reply exists. */
  readonly onRegenerate: (() => void) | undefined;
  /** The P5 game steers — present only when the chat is a live game (game-only, D110-4). */
  readonly game: { readonly plotAvailable: boolean; readonly onSteer: (kind: GuidedGameSteerKind) => void } | undefined;
  /** The re-homed image controls (attach + generate-from-text). */
  readonly image: ComposerImageControls;
}

export function UtilityMenu(props: UtilityMenuProps): ReactElement {
  const { hasText, canTargetTail, canUndoRevert, onRewrite, onRecall, onUndo, onRevert, onClear, onSimpleSend, onRegenerate, game, image } = props;
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
        {/* Regenerate — a PLAIN reroll of the tail assistant (no steer; the steer-aware reroll is the ⟳ Swipe
            icon, dual-home §2.3e). Named "Regenerate" here to distinguish it from the top-row Swipe icon. */}
        <UtilityActionItem
          icon={RotateCcw}
          label="Regenerate"
          onAction={onRegenerate}
          enabled={onRegenerate !== undefined}
          disabledReason={SWIPE_NEEDS_REPLY}
        />
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
        {/* The re-homed image controls (owner: image things into the menu). Attach uses the sanctioned
            FileDropzone picker rendered as a menu-row overlay; both stay open on click — attach opens the OS
            dialog, generate holds while it runs. */}
        <MenuSeparator />
        <AttachImagesItem maxAttachmentBytes={image.maxAttachmentBytes} disabled={image.uploadDisabled} onAddFiles={image.onAddFiles} />
        <MenuItem
          closeOnClick={false}
          disabled={!image.canGenerate}
          title={image.canGenerate ? undefined : image.generateReason}
          data-testid={testId("composerGenerateImage")}
          onClick={image.canGenerate ? image.onGenerate : undefined}
        >
          <Icon icon={Sparkles} size="sm" />
          {image.generating ? "Generating image…" : "Generate image from text"}
        </MenuItem>
        {/* The P5 game steers (owner: "game steers go in the magic wand") — game-only; the Plot steers are
            APPLICABILITY-gated on plotProgression (absent when off, never a disabled twin). */}
        {game !== undefined ? (
          <>
            <MenuSeparator />
            {game.plotAvailable
              ? RPG_PLOT_STEER_KINDS.map((kind) => (
                  <MenuItem key={kind} onClick={(): void => game.onSteer(kind)}>
                    <Icon icon={Compass} size="sm" />
                    {RPG_PLOT_STEERS[kind].label}
                  </MenuItem>
                ))
              : null}
            <MenuItem data-testid={testId("composerGuidedGameSteer")} onClick={(): void => game.onSteer("choices")}>
              <Icon icon={ListOrdered} size="sm" />
              Offer choices
            </MenuItem>
          </>
        ) : null}
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

// Attach images — the sanctioned FileDropzone picker (a raw file input is gate-banned in features) laid
// invisibly over a labeled menu row. `closeOnClick={false}` because the click opens the OS file dialog, not a
// menu action; the row renders as a plain container so the covering input is the interactive control.
function AttachImagesItem({
  maxAttachmentBytes,
  disabled,
  onAddFiles,
}: {
  readonly maxAttachmentBytes: number;
  readonly disabled: boolean;
  readonly onAddFiles: ComposerImageControls["onAddFiles"];
}): ReactElement {
  return (
    <MenuItem closeOnClick={false} disabled={disabled} className="relative" render={<div />}>
      <Icon icon={ImagePlus} size="sm" />
      Attach images
      <FileDropzone
        accept="image/*"
        multiple={true}
        maxSizeBytes={maxAttachmentBytes}
        disabled={disabled}
        onFilesSelected={onAddFiles}
        instructions=""
        aria-label="Attach images"
        className="absolute inset-0 size-full border-0 bg-transparent p-0 opacity-0"
      />
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

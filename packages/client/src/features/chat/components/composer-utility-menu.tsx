// The composer's ✨ UTILITY menu (wand v2) — everything BUSY lives here so the composer's top row is just the
// four guided icons + this ✨ trigger. Regrouped by concept (side-eye P2-A), each group a labeled MenuGroup +
// GroupLabel, ordered by frequency:
//   • Input  — Recover input (recall the last FIRED steer — the D57 ring, owner-clarified) · Corrections (the
//              rewrite/OOC dialog) · Clear input
//   • Reply  — Regenerate (a PLAIN reroll of the tail assistant, distinct RefreshCw glyph + helper — the
//              steer-aware reroll stays the ⟳ Swipe icon, §2.3e dual-home) · Simple send (post without generating)
//   • Continuation — Undo / Revert continuation
//   • Images — Attach images (the sanctioned FileDropzone, ref-triggered off the row so the input is NOT a focus
//              target inside the menuitem's accessible name — P1-C) · Generate image from text
//   • Plot   — game-only: the six plot steers nested under a Plot submenu (P1-B) + the Offer choices one-shot
// Each item is the omit-doctrine's disabled-affordance law: rendered enabled, or disabled-with-a-legible-reason,
// never hidden.

import type { GuidedGameSteerKind } from "@orb/kit/guided";
import { RPG_PLOT_STEER_KINDS, RPG_PLOT_STEERS } from "@orb/kit/guided";
import { Button } from "@orb/ui/button";
import type { FileDropzoneResult } from "@orb/ui/file-dropzone";
import { FileDropzone } from "@orb/ui/file-dropzone";
import type { LucideIcon } from "@orb/ui/icons";
import { Compass, Eraser, Icon, ImagePlus, ListOrdered, Pencil, Redo2, RefreshCw, Sparkles, Undo2, WandSparkles } from "@orb/ui/icons";
import { Menu, MenuGroup, MenuGroupLabel, MenuItem, MenuPopup, MenuSeparator, MenuSubmenuRoot, MenuSubmenuTrigger, MenuTrigger } from "@orb/ui/menu";
import type { ReactElement } from "react";
import { useRef } from "react";
import { REGENERATE_PLAIN_HELPER, SWIPE_NEEDS_REPLY, testId } from "#lib";
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
        {/* INPUT — the draft-editing actions (most frequent). */}
        <MenuGroup>
          <MenuGroupLabel>Input</MenuGroupLabel>
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
          <UtilityActionItem
            icon={Eraser}
            label="Clear input"
            onAction={onClear}
            enabled={onClear !== undefined}
            disabledReason="The composer is already empty"
          />
        </MenuGroup>
        <MenuSeparator />
        {/* REPLY — reroll / post the current reply. Regenerate wears a DISTINCT RefreshCw glyph + helper so it
            is not confused with the top-row ⟳ Swipe icon (side-eye P1-A); Swipe is steer-aware, this is plain. */}
        <MenuGroup>
          <MenuGroupLabel>Reply</MenuGroupLabel>
          <UtilityActionItem
            icon={RefreshCw}
            label="Regenerate"
            helper={REGENERATE_PLAIN_HELPER}
            onAction={onRegenerate}
            enabled={onRegenerate !== undefined}
            disabledReason={SWIPE_NEEDS_REPLY}
          />
          <UtilityActionItem
            label="Simple send"
            onAction={onSimpleSend}
            enabled={onSimpleSend !== undefined}
            disabledReason={hasText ? "Send your first message normally, then Simple send is available" : "Type a message to post"}
          />
        </MenuGroup>
        <MenuSeparator />
        {/* CONTINUATION — undo/revert the last continuation. */}
        <MenuGroup>
          <MenuGroupLabel>Continuation</MenuGroupLabel>
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
        </MenuGroup>
        <MenuSeparator />
        {/* IMAGES — the re-homed image controls (owner: image things into the menu, NOT back on the bar). */}
        <MenuGroup>
          <MenuGroupLabel>Images</MenuGroupLabel>
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
        </MenuGroup>
        {/* PLOT — game-only (owner: "game steers go in the magic wand"). The six plot steers nest under one Plot
            submenu (side-eye P1-B — no more flat icon-less dump); Offer choices is its own item (not a plot
            steer). Plot steers are APPLICABILITY-gated on plotProgression (the submenu is absent when off). */}
        {game !== undefined ? (
          <>
            <MenuSeparator />
            <MenuGroup>
              <MenuGroupLabel>Plot</MenuGroupLabel>
              {game.plotAvailable ? <PlotSteersSubmenu onSteer={game.onSteer} /> : null}
              <MenuItem data-testid={testId("composerGuidedGameSteer")} onClick={(): void => game.onSteer("choices")}>
                <Icon icon={ListOrdered} size="sm" />
                Offer choices
              </MenuItem>
            </MenuGroup>
          </>
        ) : null}
      </MenuPopup>
    </Menu>
  );
}

/** One enabled-or-disabled-with-reason utility item (the omit-doctrine's disabled-affordance law). An enabled
 *  item may carry a `helper` (a title hint even when actionable — used to distinguish Regenerate from Swipe). */
function UtilityActionItem({
  icon,
  label,
  helper,
  onAction,
  enabled,
  disabledReason,
}: {
  readonly icon?: LucideIcon;
  readonly label: string;
  readonly helper?: string;
  readonly onAction: (() => void) | undefined;
  readonly enabled: boolean;
  readonly disabledReason: string;
}): ReactElement {
  return (
    <MenuItem disabled={!enabled} title={enabled ? helper : disabledReason} onClick={enabled ? onAction : undefined}>
      {icon !== undefined ? <Icon icon={icon} size="sm" /> : null}
      {label}
    </MenuItem>
  );
}

/** The six plot steers nested under one submenu (side-eye P1-B) — renders from the RPG_PLOT_STEER_KINDS tuple
 *  (kit-homed, the axis-home rule). Each fires its steer KIND through the trusted-template guided funnel. */
function PlotSteersSubmenu({ onSteer }: { readonly onSteer: (kind: GuidedGameSteerKind) => void }): ReactElement {
  return (
    <MenuSubmenuRoot>
      <MenuSubmenuTrigger data-testid={testId("composerPlotSteers")}>
        <Icon icon={Compass} size="sm" />
        Plot
      </MenuSubmenuTrigger>
      <MenuPopup>
        {RPG_PLOT_STEER_KINDS.map((kind) => (
          <MenuItem key={kind} onClick={(): void => onSteer(kind)}>
            {RPG_PLOT_STEERS[kind].label}
          </MenuItem>
        ))}
      </MenuPopup>
    </MenuSubmenuRoot>
  );
}

// Attach images — the sanctioned FileDropzone picker (a raw file input is gate-banned in features). The input is
// kept OUT of the menuitem's accessible-name subtree (P1-C): it renders hidden (aria-hidden + tabIndex -1 so it
// is neither a focus target nor an announced control), and the menuitem TRIGGERS it via a ref click. The
// menuitem carries the single clean accessible name; `closeOnClick={false}` keeps the menu open through the OS
// dialog. Screen readers see exactly one control: "Attach images, up to {size} per file."
function AttachImagesItem({
  maxAttachmentBytes,
  disabled,
  onAddFiles,
}: {
  readonly maxAttachmentBytes: number;
  readonly disabled: boolean;
  readonly onAddFiles: ComposerImageControls["onAddFiles"];
}): ReactElement {
  const inputRef = useRef<HTMLInputElement>(null);
  const openPicker = (): void => {
    inputRef.current?.click();
  };
  return (
    <>
      <MenuItem
        closeOnClick={false}
        disabled={disabled}
        aria-label={`Attach images, up to ${formatMib(maxAttachmentBytes)} per file`}
        data-testid={testId("composerAttachImages")}
        onClick={disabled ? undefined : openPicker}
      >
        <Icon icon={ImagePlus} size="sm" />
        Attach images
      </MenuItem>
      {/* The real picker, hidden off the accessible tree — the row above triggers its input via the ref. Kept
          inside the popup so its focus/portal context is the menu's, never a stray body-level input. */}
      <FileDropzone
        ref={inputRef}
        accept="image/*"
        multiple={true}
        maxSizeBytes={maxAttachmentBytes}
        disabled={disabled}
        onFilesSelected={onAddFiles}
        instructions=""
        aria-hidden={true}
        tabIndex={-1}
        // `hidden` (display:none) drops the whole picker from BOTH layout and the accessibility tree — the row
        // above is the only visible/announced control; a display:none file input still opens on a programmatic
        // .click() (Chromium) and accepts setInputFiles, so the upload + CT paths are unaffected.
        className="hidden"
      />
    </>
  );
}

// The accessible-name byte-size hint (MB, one decimal) — a plain decimal render of the served image cap so the
// menuitem's name states the limit without depending on the dropzone's own visible hint copy.
const BYTES_PER_KIB = 1024;
const BYTES_PER_MIB = BYTES_PER_KIB * BYTES_PER_KIB;
const ONE_DECIMAL = 10;
function formatMib(bytes: number): string {
  const mib = bytes / BYTES_PER_MIB;
  const rounded = Math.round(mib * ONE_DECIMAL) / ONE_DECIMAL;
  return `${rounded} MB`;
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

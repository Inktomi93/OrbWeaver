// The composer's ✨ UTILITY menu (wand v2) — everything BUSY lives here so the composer's top row is just the
// four guided icons + this ✨ trigger. Regrouped by concept (side-eye P2-A), each group a labeled MenuGroup +
// GroupLabel, ordered by frequency:
//   • Input  — Recover input (recall the last FIRED steer — the D57 ring, owner-clarified) · Corrections (the
//              rewrite/OOC dialog) · Clear input
//   • Reply  — Regenerate (a PLAIN reroll of the tail assistant, distinct RefreshCw glyph + helper — the
//              steer-aware reroll stays the ⟳ Swipe icon, §2.3e dual-home) · Simple send (post without
//              generating) · Offer choices (R3/B1 — the ONE-SHOT ask for the next reply; un-game-gated and
//              moved out of Plot, because the standing sibling and the fence renderer are both general now)
//   • Continuation — Undo / Revert continuation
//   • Media  — Attach images & video (the sanctioned FileDropzone, ref-triggered off the row so the input is
//              NOT a focus target inside the menuitem's accessible name — P1-C; accepts image/* + mp4/webm,
//              #317) · the TWO image doors: Generate image from text (fast, spends on click — its typed text
//              IS the prompt) and Imagine (opens the /imagine modal: mode strip + preview-before-spend). Both
//              are here because both cost money and only one used to be findable (#623 P1-IA).
//   • Plot   — game-only: the six plot steers nested under a Plot submenu (P1-B)
// Each item is the omit-doctrine's disabled-affordance law: rendered enabled, or disabled-with-a-legible-reason,
// never hidden.

import type { GuidedGameSteerKind } from "@orb/kit/guided";
import { RPG_PLOT_STEER_KINDS, RPG_PLOT_STEERS } from "@orb/kit/guided";
import { Button } from "@orb/ui/button";
import type { FileDropzoneResult } from "@orb/ui/file-dropzone";
import { FileDropzone } from "@orb/ui/file-dropzone";
import type { LucideIcon } from "@orb/ui/icons";
import { Compass, Eraser, Icon, ImagePlus, Images, ListOrdered, Pencil, Redo2, RefreshCw, Sparkles, Undo2, WandSparkles } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { Menu, MenuGroup, MenuGroupLabel, MenuItem, MenuPopup, MenuSeparator, MenuSubmenuRoot, MenuSubmenuTrigger, MenuTrigger } from "@orb/ui/menu";
import { Text } from "@orb/ui/text";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { ReactElement } from "react";
import { useRef } from "react";
import {
  IMAGE_GEN_SPENDS_NOW,
  IMAGINE_DOOR_HELPER,
  OFFER_CHOICES_ONE_SHOT,
  REGENERATE_PLAIN_HELPER,
  ROOM_PICTURES_NOTE,
  SWIPE_NEEDS_REPLY,
  testId,
} from "#lib";
import { useRecentSteers } from "#state";
import type { useComposerUtilities } from "../hooks/use-composer-utilities.ts";
import type { useGuidedActions } from "../hooks/use-guided-actions.ts";
// The picker's file-type filter is DERIVED from the shared attach vocabulary (#376) — the drop and paste
// gestures gate on the same tuple, so the dialog filter and the runtime gate cannot drift.
import { ATTACH_MEDIA_ACCEPT } from "../lib/attach-media.ts";

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
  /** True in a shared room: both image doors post the picture into the room, so the Media group says so. */
  readonly sharedRoom: boolean;
  /** Opens the `/imagine` modal seeded with whatever is typed (#623 P1-IA) — the SECOND, safer image door.
   *
   *  ALWAYS actionable, and that asymmetry is the point: generate-from-text needs a prompt because the typed
   *  text IS the prompt, while an extraction mode reads the conversation instead — so on the empty composer
   *  a first-timer meets an enabled door that shows the price before spending, not a greyed-out one. Free
   *  mode with no text is a legal seed (the modal's own Generate carries the gate). */
  readonly onOpenImagine: () => void;
}

interface UtilityMenuProps {
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
  /** R3 (B1) — the ONE-SHOT "offer choices" ask for the next reply. ALWAYS present: the fence renders and the
   *  chips compose in any room, so the ask is not a game affordance. Its standing sibling is the "This chat"
   *  toggle. Separate from `game` on purpose — a prop that only existed on the game bundle is exactly how it
   *  ended up game-gated in the first place. */
  readonly onOfferChoices: () => void;
  /** The re-homed image controls (attach + generate-from-text). */
  readonly image: ComposerImageControls;
}

interface ComposerGuidedUtilityMenuProps {
  readonly hasText: boolean;
  readonly trimmed: string;
  readonly idle: boolean;
  readonly canTargetTail: boolean;
  readonly guided: ReturnType<typeof useGuidedActions>;
  readonly utilities: ReturnType<typeof useComposerUtilities>;
  readonly onChange: (text: string) => void;
  readonly onRewrite: () => void;
  readonly game: { readonly isGame: boolean; readonly plotAvailable: boolean };
  readonly image: ComposerImageControls;
}

/** Adapts the guided cluster's resolved action bundles to the utility menu without making the cluster own
 *  the menu's phase-specific wiring. */
export function ComposerGuidedUtilityMenu(props: ComposerGuidedUtilityMenuProps): ReactElement {
  const { hasText, trimmed, idle, canTargetTail, guided, utilities, onChange, onRewrite, game, image } = props;
  const tailId = guided.tailAssistantMessageId;
  return (
    <UtilityMenu
      hasText={hasText}
      canTargetTail={canTargetTail}
      canUndoRevert={guided.tailHasContinuation}
      onRewrite={onRewrite}
      onRecall={onChange}
      onUndo={tailId !== null ? (): void => utilities.undoContinue(tailId) : undefined}
      onRevert={tailId !== null ? (): void => utilities.revertContinue(tailId) : undefined}
      onClear={hasText ? (): void => onChange("") : undefined}
      onSimpleSend={hasText ? (): void => utilities.commitMessage(trimmed, () => onChange("")) : undefined}
      // Regenerate is a plain reroll of the tail assistant, distinct from the steer-aware top-row action.
      onRegenerate={canTargetTail && idle ? (): void => guided.fireSwipe("") : undefined}
      // R3: the same trusted-template funnel the game steers ride (`gameSteer:"choices"` — the wire carries
      // the KIND, the server holds the bytes), fired from every room rather than only a game one. The
      // template it resolves (`GUIDED_GAME_STEERS.choices`) is a plain literal with no rpg macros, so a
      // non-game chat resolves it identically.
      onOfferChoices={(): void => guided.fireGameSteer("choices")}
      game={game.isGame ? { plotAvailable: game.plotAvailable, onSteer: guided.fireGameSteer } : undefined}
      image={image}
    />
  );
}

function UtilityMenu(props: UtilityMenuProps): ReactElement {
  const { hasText, canTargetTail, canUndoRevert, onRewrite, onRecall, onUndo, onRevert, onClear, onSimpleSend, onRegenerate, onOfferChoices, game, image } =
    props;
  const recentSteers = useRecentSteers();
  return (
    <Menu>
      <Tooltip>
        <TooltipTrigger
          render={
            <MenuTrigger
              data-testid={testId("composerUtility")}
              render={
                // NO NATIVE `title` HERE (side-eye 2026-08-21): it read "Message tools" while the popup below
                // reads "More message actions", so Chrome stacked a SECOND tooltip with DIFFERENT copy on the
                // one control that had two answers. The accessible name stays "Message tools" (which every CT
                // and the e2e room helper address it by) and the hover/focus explanation is the tooltip popup,
                // once. Disabled MENUITEMS inside the popup keep their `title` — a menuitem cannot be
                // tooltip-wrapped, and that idiom is unaffected.
                //
                // The name now sits on the BUTTON rather than on the MenuTrigger (#1021): the trigger renders
                // this element, so it is the same DOM node and the same string — but an icon-only `@orb/ui`
                // Button now REQUIRES its name at the type level, and a name declared one component up is
                // invisible to that check (and to a reader of this element).
                <Button aria-label="Message tools" type="button" intent="ghost" size="icon" shape="pill" className="shrink-0">
                  <Icon icon={WandSparkles} size="sm" />
                </Button>
              }
            />
          }
        />
        {/* THE POPUP SPEAKS THE NAME, VERBATIM (#869). It used to read "More message actions" over an
            accessible name of "Message tools" — and on an icon-only control the popup IS the visible label, so
            WCAG 2.5.3 (§13.10 N2) failed in letter: the words on screen were not in the name. The 2026-08-21
            ruling above SURVIVES — one tooltip, no native `title`, and the name stays the "Message tools"
            string every CT and the e2e room helper address — what changed is the popup's copy, which was the
            only half free to move. */}
        <TooltipPopup side="top">Message tools</TooltipPopup>
      </Tooltip>
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
            is not confused with the top-row ⟳ Swipe icon (side-eye P1-A); Swipe is steer-aware, this is plain.
            #570 RULED (owner, 2026-08-23): KEEP BOTH — this row fires the same `guided.fireSwipe("")` as the
            swipe strip's tip chevron (swipe-strip.tsx), but the pair ratifies as CROSS-PLANE under #568's own
            logic (a composer control here vs. a reader-side pager there), so it stands as a real second door,
            not a duplicate to retire. */}
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
          {/* R3 (B1) — UN-GAME-GATED, and it lives HERE now rather than in the game-only Plot group below.
              It never was a plot steer (the Plot comment already said so); it was game-gated only because the
              standing `:::choices` posture used to exist only as an rpg feature. Both halves of the pair are
              general now — the room-level toggle is in "This chat", the tokenizer renders the fence in any
              room, and the chip click composes in any room — so a one-shot ask that works everywhere must be
              REACHABLE everywhere. Rendered ONCE: moving it out of Plot rather than duplicating it is the
              #568/#570 one-door rule, so a game chat gets the same single item, in the same place. */}
          <MenuItem data-testid={testId("composerGuidedGameSteer")} onClick={onOfferChoices} title={OFFER_CHOICES_ONE_SHOT}>
            <Icon icon={ListOrdered} size="sm" />
            Offer choices
          </MenuItem>
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
        {/* MEDIA — the re-homed image/video controls (owner: image things into the menu, NOT back on the bar). */}
        <MenuGroup>
          <MediaGroupLabel sharedRoom={image.sharedRoom} />
          <AttachMediaItem maxAttachmentBytes={image.maxAttachmentBytes} disabled={image.uploadDisabled} onAddFiles={image.onAddFiles} />
          {/* TWO IMAGE DOORS, BOTH FINDABLE (#623 P1-IA). The split itself is a RULING, not an accident —
              `features/imagery/index.ts`'s scope fence keeps this fast composer-owned door in chat and calls
              /imagine "the richer surface (mode + preview) BESIDE it, not a replacement". What was defective
              was that only the blind-spend door was discoverable: /imagine was reachable only by knowing to
              type `/`, so a first-timer's default path spends with no mode, no preview and no stated price.
              So the ruling stands and its symptom is closed by putting the beside-door literally beside it.
              This row names its spend (an enabled `title` is the Regenerate/`helper` idiom, not a disabled
              reason); the row under it is the one that lets you look first. */}
          <MenuItem
            closeOnClick={false}
            disabled={!image.canGenerate}
            title={image.canGenerate ? IMAGE_GEN_SPENDS_NOW : image.generateReason}
            data-testid={testId("composerGenerateImage")}
            onClick={image.canGenerate ? image.onGenerate : undefined}
          >
            <Icon icon={Sparkles} size="sm" />
            {image.generating ? "Generating image…" : "Generate image from text"}
          </MenuItem>
          <MenuItem data-testid={testId("composerOpenImagine")} onClick={image.onOpenImagine} title={IMAGINE_DOOR_HELPER}>
            <Icon icon={Images} size="sm" />
            Imagine — modes & preview…
          </MenuItem>
        </MenuGroup>
        {/* PLOT — game-only (owner: "game steers go in the magic wand"). The six plot steers nest under one Plot
            submenu (side-eye P1-B — no more flat icon-less dump). "Offer choices" USED to sit here as its own
            item; R3 moved it up to Reply, where it is reachable in every room (see its comment there). Plot
            steers are APPLICABILITY-gated on plotProgression (the submenu is absent when off), so a game whose
            plot progression is off now contributes no Plot group at all — the group had exactly one non-plot
            tenant and it left. */}
        {game !== undefined && game.plotAvailable ? (
          <>
            <MenuSeparator />
            <MenuGroup>
              <MenuGroupLabel>Plot</MenuGroupLabel>
              <PlotSteersSubmenu onSteer={game.onSteer} />
            </MenuGroup>
          </>
        ) : null}
      </MenuPopup>
    </Menu>
  );
}

/** The Media group's label. In a shared room it carries the sentence that generated pictures post into the
 *  room: it rides the group label because a menu may own only items, groups and separators, and the label is
 *  the group's accessible name, so a screen reader hears the sentence on entering the group. */
function MediaGroupLabel({ sharedRoom }: { readonly sharedRoom: boolean }): ReactElement {
  if (!sharedRoom) {
    return <MenuGroupLabel>Media</MenuGroupLabel>;
  }
  return (
    <MenuGroupLabel>
      <Stack gap="field">
        <Text as="span">Media</Text>
        <Text as="span" voice="gloss" data-slot="composer-room-pictures-note">
          {ROOM_PICTURES_NOTE}
        </Text>
      </Stack>
    </MenuGroupLabel>
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

// Attach images & video — the sanctioned FileDropzone picker (a raw file input is gate-banned in features).
// The input is kept OUT of the menuitem's accessible-name subtree (P1-C): it renders hidden (aria-hidden +
// tabIndex -1 so it is neither a focus target nor an announced control), and the menuitem TRIGGERS it via a
// ref click. The menuitem carries the single clean accessible name; `closeOnClick={false}` keeps the menu
// open through the OS dialog. Screen readers see exactly one control: "Attach images & video, up to {size}
// per file."
function AttachMediaItem({
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
        aria-label={`Attach images & video, up to ${formatMib(maxAttachmentBytes)} per file`}
        data-testid={testId("composerAttachImages")}
        onClick={disabled ? undefined : openPicker}
      >
        <Icon icon={ImagePlus} size="sm" />
        Attach images & video
      </MenuItem>
      {/* The real picker, hidden off the accessible tree — the row above triggers its input via the ref. Kept
          inside the popup so its focus/portal context is the menu's, never a stray body-level input. */}
      <FileDropzone
        ref={inputRef}
        accept={ATTACH_MEDIA_ACCEPT}
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

// The composer's ✨ UTILITY menu (wand v2) — everything BUSY lives here so the composer's top row is just the
// four guided icons and the adjacent Options/Tools doors. Regrouped by concept (side-eye P2-A), each group a labeled MenuGroup +
// GroupLabel. The room's own groups lead — the `composer-room` contributions (a game's Dice rolls), then Story —
// so a phone reaches a game's main action without scrolling past the generic groups. Media leads those, because
// image actions are a main use and a phone must reach them without a hidden scroll; the rest follow by frequency:
//   • Media  — Attach images & video (the sanctioned FileDropzone, ref-triggered off the row so the input is
//              NOT a focus target inside the menuitem's accessible name — P1-C; accepts image/* + mp4/webm,
//              #317) · the TWO image doors: Generate image from text (fast, spends on click — its typed text
//              IS the prompt) and Imagine (opens the /imagine modal: mode strip + preview-before-spend). Both
//              are here because both cost money and only one used to be findable (#623 P1-IA).
//              The group renders from `composer-media-group.tsx`; galleries live only in Options.
//   • Input  — Recover input (recall the last FIRED steer — the D57 ring, owner-clarified) · Corrections (the
//              rewrite/OOC dialog) · Clear input
//   • Reply  — Regenerate (a PLAIN reroll of the tail assistant, distinct RefreshCw glyph + helper — the
//              steer-aware reroll stays the ⟳ Swipe icon, §2.3e dual-home) · Simple send (post without
//              generating) · Offer choices (R3/B1 — the ONE-SHOT ask for the next reply; un-game-gated and
//              moved out of Plot, because the standing sibling and the fence renderer are both general now)
//              · Continuation submenu — Undo / Revert continuation
//   • Story  — game-only, first after the room contributions: the six plot steers under one submenu (P1-B)
// Each item is the omit-doctrine's disabled-affordance law: rendered enabled, or disabled-with-a-legible-reason,
// never hidden. Permission-filtered gallery doors live in Chat options.

import type { GuidedGameSteerKind } from "@orb/kit/guided";
import { RPG_PLOT_STEER_KINDS, RPG_PLOT_STEERS } from "@orb/kit/guided";
import { Button } from "@orb/ui/button";
import type { LucideIcon } from "@orb/ui/icons";
import { Compass, Eraser, History, Icon, ListOrdered, MessageSquarePlus, Pencil, Redo2, RefreshCw, Undo2, WandSparkles } from "@orb/ui/icons";
import { Menu, MenuGroup, MenuGroupLabel, MenuItem, MenuPopup, MenuSeparator, MenuSubmenuRoot, MenuSubmenuTrigger, MenuTrigger } from "@orb/ui/menu";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { OFFER_CHOICES_ONE_SHOT, REGENERATE_PLAIN_HELPER, SWIPE_NEEDS_REPLY, testId } from "#lib";
import { useRecentSteers } from "#state";
import type { useComposerUtilities } from "../hooks/use-composer-utilities.ts";
import type { useGuidedActions } from "../hooks/use-guided-actions.ts";
import type { ComposerImageControls } from "./composer-media-group.tsx";
import { ComposerMediaGroup } from "./composer-media-group.tsx";

interface UtilityMenuProps {
  readonly hasText: boolean;
  readonly generationEnabled: boolean;
  readonly generationUnavailableReason: string;
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
  readonly roomContributions: readonly ReactNode[];
  readonly mediaContributions: readonly ReactNode[];
}

interface ComposerGuidedUtilityMenuProps {
  readonly hasText: boolean;
  readonly trimmed: string;
  readonly idle: boolean;
  readonly generationUnavailableReason: string;
  readonly canTargetTail: boolean;
  readonly guided: ReturnType<typeof useGuidedActions>;
  readonly utilities: ReturnType<typeof useComposerUtilities>;
  readonly onChange: (text: string) => void;
  readonly onRewrite: () => void;
  readonly game: { readonly isGame: boolean; readonly plotAvailable: boolean };
  readonly image: ComposerImageControls;
  readonly roomContributions: readonly ReactNode[];
  readonly mediaContributions: readonly ReactNode[];
}

// The menu opens upward from the composer, and Base UI's available height runs to the viewport's top edge,
// so a tall menu covered the room's topbar. Reserving the chrome row keeps it under the topbar, the
// toast viewport's precedent; the menu scrolls inside the smaller box.
const MENU_BOUND: CSSProperties = { maxHeight: "calc(var(--available-height) - var(--dimension-chrome-row))" };

/** Adapts the guided cluster's resolved action bundles to the utility menu without making the cluster own
 *  the menu's phase-specific wiring. */
export function ComposerGuidedUtilityMenu(props: ComposerGuidedUtilityMenuProps): ReactElement {
  const {
    hasText,
    trimmed,
    idle,
    generationUnavailableReason,
    canTargetTail,
    guided,
    utilities,
    onChange,
    onRewrite,
    game,
    image,
    roomContributions,
    mediaContributions,
  } = props;
  const tailId = guided.tailAssistantMessageId;
  return (
    <UtilityMenu
      hasText={hasText}
      generationEnabled={idle}
      generationUnavailableReason={generationUnavailableReason}
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
      roomContributions={roomContributions}
      mediaContributions={mediaContributions}
    />
  );
}

function UtilityMenu(props: UtilityMenuProps): ReactElement {
  const {
    hasText,
    generationEnabled,
    generationUnavailableReason,
    canTargetTail,
    canUndoRevert,
    onRewrite,
    onRecall,
    onUndo,
    onRevert,
    onClear,
    onSimpleSend,
    onRegenerate,
    onOfferChoices,
    game,
    image,
    roomContributions,
    mediaContributions,
  } = props;
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
      <MenuPopup side="top" style={MENU_BOUND}>
        {/* THE ROOM'S OWN GROUPS LEAD. Each contribution closes its group with a separator. */}
        {roomContributions}
        {/* STORY — game-only (owner: "game steers go in the magic wand"). The six plot steers nest under one
            submenu (side-eye P1-B — no more flat icon-less dump). Plot steers are APPLICABILITY-gated on
            plotProgression, so a game whose plot progression is off contributes no Story group at all. */}
        {game !== undefined && game.plotAvailable ? (
          <>
            <MenuGroup>
              <MenuGroupLabel>Story</MenuGroupLabel>
              <PlotSteersSubmenu enabled={generationEnabled} reason={generationUnavailableReason} onSteer={game.onSteer} />
            </MenuGroup>
            <MenuSeparator />
          </>
        ) : null}
        {/* MEDIA — the re-homed image/video controls (owner: image things into the menu, NOT back on the bar). It
            leads the generic groups: the menu scrolls inside a height bound, and on a phone a trailing group opens
            below that bound. `composer-media` contributions follow it, each opening on a separator. */}
        <ComposerMediaGroup image={image} />
        {mediaContributions}
        <MenuSeparator />
        {/* INPUT — the draft-editing actions. */}
        <MenuGroup>
          <MenuGroupLabel>Input</MenuGroupLabel>
          {/* Recover input = recall the LAST steer you fired (owner-clarified — the D57 fired-steer ring, NOT
              unfired-draft recovery). Disabled with a reason when the ring is empty (nothing to recover yet). */}
          {recentSteers.length > 0 ? (
            <RecoverInputSubmenu steers={recentSteers} onRecall={onRecall} />
          ) : (
            <MenuItem disabled={true} title="Fire a guided action first — then you can recall it">
              <Icon icon={History} size="sm" />
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
            icon={MessageSquarePlus}
            label="Simple send"
            onAction={onSimpleSend}
            enabled={onSimpleSend !== undefined}
            disabledReason={hasText ? "Send your first message normally, then Simple send is available" : "Type a message to post"}
          />
          {/* R3 (B1) — UN-GAME-GATED, and it lives HERE rather than in the game-only Story group.
              It never was a plot steer (the Plot comment already said so); it was game-gated only because the
              standing `:::choices` posture used to exist only as an rpg feature. Both halves of the pair are
              general now — the room-level toggle is in "This chat", the tokenizer renders the fence in any
              room, and the chip click composes in any room — so a one-shot ask that works everywhere must be
              REACHABLE everywhere. Rendered ONCE: moving it out of Plot rather than duplicating it is the
              #568/#570 one-door rule, so a game chat gets the same single item, in the same place. */}
          <MenuItem
            data-testid={testId("composerGuidedGameSteer")}
            disabled={!generationEnabled}
            onClick={generationEnabled ? onOfferChoices : undefined}
            title={generationEnabled ? OFFER_CHOICES_ONE_SHOT : generationUnavailableReason}
          >
            <Icon icon={ListOrdered} size="sm" />
            Offer choices
          </MenuItem>
          <MenuSubmenuRoot>
            <MenuSubmenuTrigger>
              <Icon icon={Undo2} size="sm" />
              Continuation
            </MenuSubmenuTrigger>
            <MenuPopup>
              <MenuGroup>
                <MenuGroupLabel>{canUndoRevert ? "Continuation" : "Continue a reply first — nothing to undo or revert yet"}</MenuGroupLabel>
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
            </MenuPopup>
          </MenuSubmenuRoot>
        </MenuGroup>
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
function PlotSteersSubmenu({
  enabled,
  reason,
  onSteer,
}: {
  readonly enabled: boolean;
  readonly reason: string;
  readonly onSteer: (kind: GuidedGameSteerKind) => void;
}): ReactElement {
  return (
    <MenuSubmenuRoot>
      <MenuSubmenuTrigger data-testid={testId("composerPlotSteers")} disabled={!enabled} title={enabled ? undefined : reason}>
        <Icon icon={Compass} size="sm" />
        Steer the plot
      </MenuSubmenuTrigger>
      <MenuPopup>
        {RPG_PLOT_STEER_KINDS.map((kind) => (
          <MenuItem disabled={!enabled} key={kind} onClick={enabled ? (): void => onSteer(kind) : undefined}>
            {RPG_PLOT_STEERS[kind].label}
          </MenuItem>
        ))}
      </MenuPopup>
    </MenuSubmenuRoot>
  );
}

/** Recall a fired steer back into the composer (the D57 ring). The ring is DE-DUPED on push
 *  (`pushFiredSteer` filters an exact repeat to the front), so each steer string is unique — a content key
 *  is collision-free (the old wand's `key={steer}` collision defect is gone once the ring dedupes). Truncated. */
function RecoverInputSubmenu({ steers, onRecall }: { readonly steers: readonly string[]; readonly onRecall: (steer: string) => void }): ReactElement {
  return (
    <MenuSubmenuRoot>
      <MenuSubmenuTrigger>
        <Icon icon={History} size="sm" />
        Recover input
      </MenuSubmenuTrigger>
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

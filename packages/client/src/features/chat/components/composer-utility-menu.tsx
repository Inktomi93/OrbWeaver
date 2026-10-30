// The composer's ✨ UTILITY menu (wand v2) — everything BUSY lives here so the composer's top row is just the
// four guided icons and the adjacent Options/Tools doors. Grouped by concept, each group a labeled MenuGroup +
// GroupLabel. The room's own groups lead — the `composer-room` contributions (a game's Dice rolls), then Story —
// so a phone reaches a game's main action without scrolling past the generic groups. Media leads those, because
// image actions are a main use and a phone must reach them without a hidden scroll; the rest follow by frequency:
//   • Media  — Attach images & video (the sanctioned FileDropzone, ref-triggered off the row so the input is
//              NOT a focus target inside the menuitem's accessible name; accepts image/* + mp4/webm)
//              · the TWO image doors: Generate image from text (fast, spends on click — its typed text
//              IS the prompt) and Imagine (opens the /imagine modal: mode strip + preview-before-spend). Both
//              are here because both cost money, so both must be findable.
//              The group renders from `composer-media-group.tsx`; galleries live only in Options.
//   • Input  — Recover input (recall the last FIRED steer — the D57 ring, owner-clarified) · Corrections (the
//              rewrite/OOC dialog) · Clear input
//   • Reply  — Regenerate (a PLAIN reroll of the tail assistant, distinct RefreshCw glyph + helper — the
//              steer-aware reroll stays the ⟳ Swipe icon, §2.3e dual-home) · Simple send (post without
//              generating) · Offer choices (the ONE-SHOT ask for the next reply; not game-gated, because the
//              standing sibling and the fence renderer are both general)
//              · Continuation submenu — Undo / Revert continuation
//   • Story  — game-only, first after the room contributions: the six plot steers under one submenu
// Each item is the omit-doctrine's disabled-affordance law: rendered enabled, or disabled with its reason as a
// visible detail line, never hidden. Permission-filtered gallery doors live in Chat options.

import type { GuidedGameSteerKind } from "@orb/kit/guided";
import { RPG_PLOT_STEER_KINDS, RPG_PLOT_STEERS } from "@orb/kit/guided";
import { Button } from "@orb/ui/button";
import type { LucideIcon } from "@orb/ui/icons";
import { Compass, Eraser, History, Icon, ListOrdered, MessageSquarePlus, Pencil, Redo2, RefreshCw, Undo2, WandSparkles } from "@orb/ui/icons";
import { Stack } from "@orb/ui/layout";
import { Menu, MenuGroup, MenuGroupLabel, MenuItem, MenuPopup, MenuSeparator, MenuSubmenuRoot, MenuSubmenuTrigger, MenuTrigger } from "@orb/ui/menu";
import { Text } from "@orb/ui/text";
import { Tooltip, TooltipPopup, TooltipTrigger } from "@orb/ui/tooltip";
import type { ReactElement, ReactNode } from "react";
import { useId } from "react";
import { DescribedMenuItem } from "#components";
import { OFFER_CHOICES_ONE_SHOT, REGENERATE_PLAIN_HELPER, SWIPE_NEEDS_REPLY, testId } from "#lib";
import { useRecentSteers } from "#state";
import type { useComposerUtilities } from "../hooks/use-composer-utilities.ts";
import type { UseGuidedActionsResult, useGuidedActions } from "../hooks/use-guided-actions.ts";
import type { ComposerImageControls } from "./composer-media-group.tsx";
import { ComposerMediaGroup } from "./composer-media-group.tsx";

const PLOT_STEERS_LABEL = "Steer the plot";

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
  readonly game: { readonly plotAvailable: boolean; readonly onSteer: UseGuidedActionsResult["fireGameSteer"] } | undefined;
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
                // NO NATIVE `title` HERE: a second, native tooltip would stack over the popup. The accessible
                // name is "Message tools" (which every CT and the e2e room helper address it by) and the
                // hover/focus explanation is the tooltip popup, once. A disabled MENUITEM inside the popup says
                // its reason as a visible detail line — a menuitem cannot be tooltip-wrapped.
                //
                // The name sits on the BUTTON rather than on the MenuTrigger: the trigger renders this element,
                // so it is the same DOM node and the same string — but an icon-only `@orb/ui` Button REQUIRES
                // its name at the type level, and a name declared one component up is invisible to that check
                // (and to a reader of this element).
                <Button aria-label="Message tools" type="button" intent="ghost" size="glyph-lg" shape="pill" className="shrink-0">
                  <Icon icon={WandSparkles} size="sm" />
                </Button>
              }
            />
          }
        />
        {/* THE POPUP SPEAKS THE NAME, VERBATIM. On an icon-only control the popup IS the visible label, so
            WCAG 2.5.3 (§13.10 N2) requires the words on screen to be in the name: one tooltip, no native
            `title`, and the "Message tools" string every CT and the e2e room helper address. */}
        <TooltipPopup side="bottom">Message tools</TooltipPopup>
      </Tooltip>
      {/* The menu opens upward from the composer, and Base UI's available height runs to the viewport's top edge, so a
          tall menu covered the room's topbar. `belowChrome` keeps it under the topbar; the menu scrolls inside. */}
      <MenuPopup clamp="belowChrome" side="top">
        {/* THE ROOM'S OWN GROUPS LEAD. Each contribution closes its group with a separator. */}
        {roomContributions}
        {/* STORY — game-only (owner: "game steers go in the magic wand"). The six plot steers nest under one
            submenu (side-eye P1-B — no more flat icon-less dump). Plot steers are APPLICABILITY-gated on
            plotProgression, so a game whose plot progression is off contributes no Story group at all. */}
        {game?.plotAvailable === true ? (
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
            <DescribedMenuItem detail="Fire a guided action first — then you can recall it" disabled={true} icon={History} label="Recover input" />
          )}
          <DescribedMenuItem
            detail={canTargetTail ? undefined : SWIPE_NEEDS_REPLY}
            disabled={!canTargetTail}
            icon={Pencil}
            label="Corrections…"
            onClick={canTargetTail ? onRewrite : undefined}
          />
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
            is not confused with the top-row ⟳ Swipe icon; Swipe is steer-aware, this is plain. An owner ruling
            KEEPS BOTH: this row fires the same `guided.fireSwipe("")` as the swipe strip's tip chevron
            (swipe-strip.tsx), but the pair is CROSS-PLANE (a composer control here vs. a reader-side pager
            there), so it stands as a real second door, not a duplicate to retire. */}
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
          {/* NOT GAME-GATED, and it lives HERE rather than in the game-only Story group: it is not a plot
              steer. Both halves of the pair are general — the room-level toggle is in "This chat", the tokenizer
              renders the fence in any room, and the chip click composes in any room — so a one-shot ask that
              works everywhere must be REACHABLE everywhere. Rendered ONCE (the one-door rule), so a game chat
              gets the same single item, in the same place. */}
          <DescribedMenuItem
            data-testid={testId("composerGuidedGameSteer")}
            detail={generationEnabled ? OFFER_CHOICES_ONE_SHOT : generationUnavailableReason}
            disabled={!generationEnabled}
            icon={ListOrdered}
            label="Offer choices"
            onClick={generationEnabled ? onOfferChoices : undefined}
          />
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
 *  item may carry a `helper` detail line (it tells Regenerate from Swipe). */
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
    <DescribedMenuItem
      detail={enabled ? helper : disabledReason}
      disabled={!enabled}
      {...(icon === undefined ? {} : { icon })}
      label={label}
      onClick={enabled ? onAction : undefined}
    />
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
  const labelId = useId();
  const reasonId = useId();
  return (
    <MenuSubmenuRoot>
      <MenuSubmenuTrigger
        aria-describedby={enabled ? undefined : reasonId}
        aria-labelledby={enabled ? undefined : labelId}
        data-testid={testId("composerPlotSteers")}
        disabled={!enabled}
      >
        <Icon icon={Compass} size="sm" />
        {enabled ? (
          PLOT_STEERS_LABEL
        ) : (
          <Stack gap="tight">
            <span id={labelId}>{PLOT_STEERS_LABEL}</span>
            <Text id={reasonId} voice="gloss">
              {reason}
            </Text>
          </Stack>
        )}
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
 *  is collision-free. Truncated; the item's text is its full accessible name. */
function RecoverInputSubmenu({ steers, onRecall }: { readonly steers: readonly string[]; readonly onRecall: (steer: string) => void }): ReactElement {
  return (
    <MenuSubmenuRoot>
      <MenuSubmenuTrigger>
        <Icon icon={History} size="sm" />
        Recover input
      </MenuSubmenuTrigger>
      <MenuPopup>
        {steers.map((steer) => (
          <MenuItem key={steer} onClick={(): void => onRecall(steer)} className="truncate max-inline-cq-20">
            {steer}
          </MenuItem>
        ))}
      </MenuPopup>
    </MenuSubmenuRoot>
  );
}

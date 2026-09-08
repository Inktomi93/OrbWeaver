// The preset editor's sticky band — the artifact's identity (name + its rename door + the ACTIVE truth), its
// two header commands (Activate, Reset to starter), the live autosave status, and the ONE view-tab strip. Split out of
// `preset-editor-surface.tsx` (#496) when the union of two same-day merges crossed the 450-line
// component-size cap; every ruling recorded against this band moved WITH it, verbatim.
//
// It renders INSIDE the surface's `<Tabs>` (the strip is `TabsList` — the ONE writer of the view axis lives
// in the surface, which owns `value`/`onValueChange`), and it owns nothing the surface needs back: the reset
// CONFIRM lives here with the door it guards, and the surface injects only the act (`onConfirmReset` — the
// mutation + reseed, which are session concerns).
//
// HEADER TRUTH (G7): the band states the ONE fact that changes UNDER the editor and is otherwise only
// legible in another pane — whether this preset is the ACTIVE one for generation. (The model chip that used
// to stand beside it died 2026-08-19; the reversal is recorded at its old site, below.) The fork-once
// retarget MOVES activation while you edit, and on mobile the LIST is a closed sheet, so a status naming an
// actionable state must be able to act: the Activate affordance renders ONLY in the not-active state and
// rides the SAME `useSetDefaultPreset` mutation as the row toggle and its kebab mirror (§16 row 3 echo b —
// the sanctioned echo, one writer).

import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
// `Download` is GONE with the header Export door (O-16★ — one home, the list-row kebab); `Container` is lane B's shared content-column ruling.
import { Icon, Pencil, RotateCcw, Zap } from "@orb/ui/icons";
import { Container, Row, Stack } from "@orb/ui/layout";
import { SCROLL_FADE_X_CLASS } from "@orb/ui/lib";
import { useScrollFadeX } from "@orb/ui/scroll-area";
import { TabsIndicator, TabsList, TabsTab } from "@orb/ui/tabs";
import { Heading } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { ConfirmDialog } from "#components";
import type { AutosaveSaveState } from "#forms";
import { AutosaveStatus } from "#forms/editor";
import { PRESET_EDITOR_VIEWS } from "../lib/preset-nav.ts";
import { PresetRenameDialog } from "./preset-rename-dialog.tsx";

/** ONE string for the reset door's accessible name AND its hover tooltip (the O-3 icon-door anatomy). */
const RESET_LABEL = "Reset to starter arrangement";
/** …and one for the rename door beside the name (same anatomy — see the door's own note). */
const RENAME_LABEL = "Rename preset";

export interface PresetEditorHeaderProps {
  readonly presetName: string;
  /** This preset is the ACTIVE-for-generation pick (the built-in ⇔ `defaultPresetId === null`). */
  readonly active: boolean;
  /** The locked built-in: no Export (it re-seeds on the target box), no Reset (it IS the starter). */
  readonly isSystemDefault: boolean;
  /** Make it the pick — the one `setDefault` mutation the LIST row toggle also calls (§16 row 3). */
  readonly onActivate: () => void;
  /** Commit a new name — the `preset.update {id, name}` name-only write. Since #506 this is the verb's ONLY
   *  caller (the list-row kebab's Rename is gone; see the door below).
   *  The DIALOG lives here with its door (the reset door's own posture); the WRITE is the surface's. */
  readonly onRename: (name: string) => void;
  readonly saveState: AutosaveSaveState;
  /** Re-run the pending save — the session's `retrySave`. */
  readonly onRetrySave: () => void;
  /** The reset ACT (mutate + reseed) — the confirm that guards it lives here with its door. */
  readonly onConfirmReset: () => void;
}

export function PresetEditorHeader({
  presetName,
  active,
  isSystemDefault,
  onActivate,
  onRename,
  saveState,
  onRetrySave,
  onConfirmReset,
}: PresetEditorHeaderProps): ReactElement {
  // The view strip's scroll box (see its own note below) — the hook keeps `@orb/ui`'s `.scroll-fade-x`
  // edge cue honest about which edge is currently hiding a view.
  const stripRef = useRef<HTMLDivElement>(null);
  useScrollFadeX(stripRef);

  const [resetOpen, setResetOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);

  return (
    <>
      {/* THE HEADER SHARES THE BODY'S COLUMN (side-eye 2026-08-19 P1-1). The sticky band itself stays
          full-bleed — it is the surface a scrolled body slides under, and a capped band would leave the
          body visible through the gap — but its CONTENT rides the same capped, centered column every view
          body does, one element in. Measured before: at a 1520px pane the name + its Activate/Reset cluster
          spanned 1822px over a centered body, so the two ends of the header sat a hand-span outside the
          thing they belong to; they aligned only below the cap, where the column IS the pane.
          The `Container` is here for the same reason it is around each panel: `@5xl` has to measure the
          PANE, and only a container can. Same classes as the panel column, deliberately — the header and
          the body must breathe together or they realign at every dock.

          RE-DERIVED AND HELD (side-eye 2026-08-22 P2-1, which read the header as 176px wider than "the
          body column"). Measured live at that arm (both panels hidden, `main` = 1224px): header x=220
          w=896 and panel column x=220 w=896, on all five tabs — the panel column has carried this exact
          class pair since 45cf001d53 (2026-08-01), so the ruling above was never broken. What that report
          measured is a THIRD, deeper column: the Params deck's own 720px instrument cap
          (`params-deck.tsx`, side-eye 2026-08-19 P2), which is why the offset shows on Params and on no
          other tab. Fenced by a CT; the deck's cap is argued at its own site. */}
      <Stack gap="block" padding="block" className="sticky top-0 z-(--z-raised) bg-card">
        <Container className="w-full">
          <Stack className="mx-auto w-full max-w-(--width-content-col) @5xl:max-w-(--width-content-col-wide)" gap="block">
            <Row align="center" justify="between" gap="field">
              <Row align="center" className="min-w-0" gap="field">
                {/* The artifact's NAME is an h2 (side-eye F-28 / ARIA rec 8): it was a <p>, with the view's
                    kickers as h3s under no h2 at all, so heading navigation could not find the thing being
                    edited. It now RENDERS like the title it is (crunch-list 13): `voice="label"` held it at
                    the deck's 13px/500 label step, so the one thing the whole pane is about read as just
                    another field name beside its own chips. The h2's default `title` size + semibold is the
                    step the mock draws. */}
                {/* IT DEFERS TO THE TOPBAR AT THE SHELL'S NARROW BUDGET (side-eye 2026-08-19 P2). On a
                    phone the shell's topbar already prints the open preset's name (the section's
                    `useSelectionTitle`), so the name stood twice, 45px apart, in the one regime with the
                    least room for it. `data-shell-identity="defer"` is the SHELL's own opt-in marker and
                    the rule lives with the query that decides it (`shell.css`, the same
                    `@container shell-main (max-width: 30rem)` block that swaps the topbar's identity arms)
                    — a feature must not re-spell that threshold, and `useMobileViewport()` is a DIFFERENT
                    question (a viewport media query, not the content container's width): between 30rem and
                    the mobile breakpoint the topbar renders its WIDE arm, which for Presets is nothing at
                    all while the list is docked, so hiding on that signal would lose the name outright. */}
                <Heading className="min-w-24 shrink truncate" data-shell-identity="defer" level={2}>
                  {presetName}
                </Heading>
                {/* THE NAME HAS A DOOR HERE (#483, side-eye 2026-08-22 flow verdict 1). `New` mints a preset
                    called "New preset", opens THIS editor, and until now the only way to name it was the
                    OTHER pane's row kebab — a control far from where its effect shows (§13), on the very
                    first thing a new user does, and on mobile the LIST is a closed sheet, so from here the
                    name could not be changed at all.

                    IT FORKED A RECORDED ONE-HOME RULING, SAID SO, AND THE FORK IS NOW RESOLVED THE OTHER WAY
                    (#506, on #442's ruling for the same verb on world-info: "rename single-homes in the
                    EDITOR" — the posture tags and regex already ship). The ruling it read against, recorded
                    two elements down and quoted whole: Export "lived in BOTH this kebab and the LIST row's…
                    ONE home — the list-row kebab, matching the characters/chats precedent that lifecycle
                    lives list-side" (O-16★, owner). #481 applied the same test to the Activate echo. Read
                    strictly, Rename was a kebab item too, so this WAS a second door — and one-home was
                    settled by deleting the LIST's item, not this one, which is the arm this comment argued
                    for below. THE O-16★ RULING SURVIVES INTACT: it is a rule about LIFECYCLE, and the line
                    it draws is exactly the one #442 draws — Export produces a FILE (lifecycle, list-side);
                    renaming EDITS the artifact you have open.
                    Why the editor is the home, on the band's OWN recorded grammar: the Activate affordance
                    three elements up survives here for exactly this reason — "a status naming an actionable
                    state must be able to act" when "on mobile the LIST is a closed sheet". The NAME is that
                    band's other stated truth (the h2 is the one thing the pane is about), and it was the one
                    the editor could not act on.
                    Why an icon door and NOT the title itself (the report's own phrasing was "the h2 title is
                    inert"): three recorded rulings pin what that heading's accessible name must be — F-28
                    (heading navigation must find the thing being edited), the 2026-08-19 shell-identity
                    defer, and crunch-13's title step. A control's name would have to say what it DOES, and a
                    heading's must say what it IS; making one element carry both means one of them lies. The
                    O-3 icon-door anatomy (`aria-label` and the native `title` from ONE string, so tooltip
                    and accessible name cannot drift) is what the Reset door beside it already speaks. */}
                {isSystemDefault ? null : (
                  <Button aria-label={RENAME_LABEL} intent="ghost" onClick={(): void => setRenameOpen(true)} size="icon" title={RENAME_LABEL} type="button">
                    <Icon icon={Pencil} size="sm" />
                  </Button>
                )}
                {/* G7 — the two truths that change UNDER the editor. The ACTIVE chip is the LIST row's marker
                    verbatim (one state, one reading); its not-active twin is an AFFORDANCE, because a status
                    that only ever says "not active" is a dead end when the LIST is a closed sheet.
                    `tone="soft"` (rider 1 / side-eye F-06): a SOLID ember chip carried the same fill as the
                    pane's one primary CTA, so a status read as a second call to action. */}
                {active ? (
                  <Badge intent="primary" size="sm" tone="soft">
                    Active
                  </Badge>
                ) : (
                  // ITS NAME IS DISTINCT FROM THE LIST RADIO'S (side-eye 2026-08-19 P2). Both controls spelled
                  // `Activate <name> for generation`, in two different ROLES (a one-of-N `radio` in the list's
                  // radiogroup, a `button` here), so an a11y walk of the app met one name attached to two
                  // contracts — and the walker cannot tell from the name which one it landed on. The ROLE split
                  // is correct and stays: the list is where the pick LIVES (one-of-N, roving tabindex), and this
                  // is a one-shot COMMAND on the thing you are editing. So the command names itself as one, in
                  // the editor's own deictic voice ("this preset" — the header is already about a named preset,
                  // which the h2 two elements away states). One act, one writer, two honestly-different names.
                  // THE NAME LEADS WITH THE VISIBLE WORD (side-eye 2026-08-19 P1-2 — WCAG 2.5.3 label-in-name).
                  // The F-5 split above is right and stays; what it got wrong is that it replaced the label
                  // instead of extending it, so a control reading "Activate" answered only to a phrase that
                  // does not contain that word — unaddressable by speech, and unmatchable by anyone who types
                  // what they can see. Visible word first, then the editor-voice gloss that keeps it distinct
                  // from the list's radio.
                  <Button aria-label="Activate — use this preset for generation" intent="ghost" onClick={onActivate} size="sm" type="button">
                    <Icon icon={Zap} size="sm" />
                    Activate
                  </Button>
                )}
                {/* THE MODEL CHIP IS DEAD (side-eye 2026-08-19 P1-3), and this REVERSES the sanctioned-echo
                    ruling recorded here on 2026-08-02 — read both, the orchestrator owns the reconciliation.
                    The old ruling: the `resolved for <model>` line is the provenance of every ghosted number,
                    the readout that owns it lives in a CONTEXT panel that is "away on narrow and closable
                    everywhere", so a truncating chip beside the name is a justified §16 echo.
                    Today's measurement: the echo is paid in the NAME. At the 568px content pane the header
                    band spends its width on a chip that is a strict PREFIX of a line the CONTEXT panel is
                    rendering in full AT THE SAME TIME, and the preset's own name — the one thing the whole
                    pane is about — truncates to pay for it. The F-11 fix ("it truncates, and the name does
                    not") held the name's floor but not its legibility.
                    What survives of the old ruling: the panel-away case. It is a real state, and the answer to
                    it is that the READOUT is the one home for resolution truth (`resolvedForLabel` still spells
                    it, once, for that panel) — not a permanent tax on every header in every regime. */}
              </Row>
              <Row align="center" gap="field">
                {/* Autosave everywhere (§7): the live status stands where Save/Discard used to. */}
                <AutosaveStatus state={saveState} onRetry={onRetrySave} />
                {/* The BUILT-IN's menu would hold NOTHING — "Reset to starter" is a no-op wearing a
                    destructive confirm, because the built-in IS the starter arrangement (side-eye F-25). An
                    empty menu renders no ⋯ at all rather than a trigger that opens nothing (the section
                    drill-in's own rule); items are OMITTED, never disabled.

                    EXPORT IS NOT HERE (crunch-list O-16★, owner ruling): it lived in BOTH this kebab and the
                    LIST row's, and the fix-all's §16 rows 7+27 sanction of that echo is OVERRULED. ONE home —
                    the list-row kebab, matching the characters/chats precedent that lifecycle lives
                    list-side. */}
                {/* NO ⋯ OVER A SINGLE COMMAND (side-eye F-18). The overflow held exactly one item, so it
                    bought nothing and cost discoverability twice over: `⋯` signals "there is more here" (there
                    isn't) and signals nothing about WHAT, so the only way to learn the surface offers a reset
                    was to open a menu on the chance. The command is now its own control, wearing its own
                    glyph, with the O-3 icon-door anatomy this feature already speaks — `aria-label` and the
                    native `title` from ONE string, so the tooltip and the accessible name cannot drift. If a
                    second header command ever lands, the kebab comes back with two items in it. */}
                {isSystemDefault ? null : (
                  <Button aria-label={RESET_LABEL} intent="ghost" onClick={(): void => setResetOpen(true)} size="icon" title={RESET_LABEL} type="button">
                    <Icon icon={RotateCcw} size="sm" />
                  </Button>
                )}
              </Row>
            </Row>
            {/* THE STRIP DEGRADES TO A SCROLL (side-eye 2026-08-19 P1-1), which is the house rule for a
                strip that outgrows its box — `shell.css` states it for the context tabs verbatim: "degrade
                to a SCROLL, never into an ellipsis". Measured before: a 503px tablist in a 390px content
                pane, so "Transforms" painted UNDER the CONTEXT panel with no pointer able to reach it.
                The scroll box is a WRAPPER and not the `TabsList` itself, for two reasons: the list's own
                `w-fit` is what makes the tabs measure their words, and a scroll container clips its
                overflow on BOTH axes (CSS computes a `visible` axis to `auto` when the other is not),
                which would eat the tabs' `ring-offset-2` focus halo — `py-tight` is the 4px of headroom
                that halo needs, paid once, here. `.scroll-fade-x` is `@orb/ui`'s own edge-fade recipe
                (globals.css), driven by the hook per its stated consumer contract: an edge dissolves only
                while it is actually hiding something. */}
            <Row className={`${SCROLL_FADE_X_CLASS} min-w-0 overflow-x-auto py-tight`} ref={stripRef}>
              {/* THE STRIP NAMES ITSELF (side-eye 2026-08-22 P3-4). Without this the tablist's accessible
                  name computed from its own contents — `ParamsPromptActionsDataTransforms` — which was
                  the ONE element of 112 mapped controls on this surface that resolved to a DOM-path
                  selector instead of a semantic one. */}
              <TabsList aria-label="Preset sections">
                {PRESET_EDITOR_VIEWS.map((entry) => (
                  <TabsTab key={entry.id} value={entry.id}>
                    {entry.label}
                  </TabsTab>
                ))}
                <TabsIndicator />
              </TabsList>
            </Row>
          </Stack>
        </Container>
      </Stack>

      {/* The rename dialog is the LIST's own component, mounted here — ONE flow, one write, two doors. */}
      <PresetRenameDialog currentName={presetName} onOpenChange={setRenameOpen} onRename={onRename} open={renameOpen} />

      <ConfirmDialog
        open={resetOpen}
        onOpenChange={setResetOpen}
        title="Reset to the starter arrangement?"
        description="This replaces the preset's sampling, reasoning, prompt structure, and every other setting with the starter defaults. This can't be undone."
        confirmLabel="Reset"
        onConfirm={onConfirmReset}
      />
    </>
  );
}

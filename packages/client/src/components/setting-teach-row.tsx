// SettingRow + ConfigTeachScope — the knob row's TEACHER binding (#866 S3)
// and, since #932/#927/#928, its whole ANATOMY. A knob section provides ONE scope (its group id + its own
// `ConfigSubcategory` nav const), wraps its rows in a `SettingRowGroup`, and wraps each Field row in a
// `SettingRow` naming the row's LEAF. The row then:
//   · publishes the FOCUSED-SETTING seam (`configFocus`) on focus-within and on click, and — fine pointers
//     only, after a delay — on hover (owner fork F-8: a pull revelation; never on coarse, never hover-only);
//   · publishes the ROW ANNOTATION (`ConfigRowAnnotation`, #state) that `useBoundField` merges into the
//     `<Field>`: the registry GLOSS as the field's description and the teacher DOOR as the label-adjacent
//     `i`'s activation. That is the #927 fix — the `i` used to be the row's LAST child, past the control
//     and past the row menu, where adjacency said it was a third row ACTION rather than an annotation on
//     the label. It is now `Field`'s own `HintTrigger`, a SIBLING of `Field.Label` inside `field-label-row`,
//     which is what keeps "More info" out of the control's accessible name while `Field.Description` keeps
//     the gloss in `aria-describedby`. Base UI 1.7 has no native label-adjacent action part; this anatomy
//     is ours and was already correct — only the activation was missing;
//   · owns the trailing reserved ACTION CELL (`SettingRowActions`, #928);
//   · wears `data-setting` (the deep-link/flash target) and the search-match tint while `configSearchMatch`
//     names it (§3.4's in-place mark, at row grain — the label's own text is sealed inside the form field).
//
// THE GLOSS IS THE E5 HALF and it is not decoration: the re-drive measured only 8 of 24 rows
// self-explanatory at rest (Chat & message handling: 2 of 11). S3 pulled inline prose out because rows
// felt heavy; the measurement disproved it — rows did not get tighter, they got emptier. The gloss is the
// leaf's own `teach.summary` first sentence, so the row and the teacher can never disagree, and the `i`'s
// tooltip becomes the leaf's AFFECTS list: the gloss says WHAT, the `i` says MORE (re-drive #1099).
//
// The row is a SUBGRID of its `SettingRowGroup` (the middle link of a three-link chain — see that file
// for why): it spans all four of the section's tracks and re-exposes them, so the Field inside lands its
// label and its control in the shared label/control tracks, the action cell lands in the shared third,
// and the fourth (a `1fr` slack track) is what gives a full-span gloss, canvas or detail block a real
// width to lay out in.
// Client tier 2 (NOT @orb/ui — it reads `#state`, the character-picker precedent) because contributions
// across many features mount it and features may not import each other.

import { FieldLayout } from "@orb/ui/field";
import { HintTrigger } from "@orb/ui/hint-trigger";
import { Grid, Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { PointerEvent, ReactElement, ReactNode } from "react";
import { createContext, use, useEffect, useRef } from "react";
import { cn, settingGloss } from "#lib";
import type { ConfigGroupId, ConfigRowAnnotation, ConfigSubcategory, SettingTeach } from "#state";
import { ConfigRowAnnotationProvider, isTeachNone, revealContextPanel, setConfigFocus, useConfigSearchMatch } from "#state";
import { SettingRowActions } from "./setting-row-actions.tsx";
import type { ConfigLeafAddress, ConfigLeafValue } from "./use-config-leaf.ts";
import { useConfigLeaf } from "./use-config-leaf.ts";

/** How long a fine pointer RESTS on a row before the hover counts as "looking at it" (F-8) — long enough
 *  that a travel-through never teaches, short enough that a genuine pause does. */
const HOVER_FOCUS_DELAY_MS = 350;

export interface ConfigTeachScopeValue {
  readonly group: ConfigGroupId;
  readonly sub: ConfigSubcategory;
}

const TeachScopeContext = createContext<ConfigTeachScopeValue | null>(null);

/** The section-level half of the seam — provided ONCE per knob section, from the same nav const the
 *  contribution registers (one spelling, so a row can never publish an address its section does not own). */
export function ConfigTeachScope({ value, children }: { readonly value: ConfigTeachScopeValue; readonly children: ReactNode }): ReactElement {
  return <TeachScopeContext value={value}>{children}</TeachScopeContext>;
}

export interface SettingRowProps {
  /** The row's LEAF id inside the scope's subcategory — the declared `settings[]` entry (R-TEACH makes its
   *  `teach` a compile-time requirement, so a row here always has a lesson or a stated opt-out). */
  readonly settingId: string;
  /**
   * FULL-SPAN mode: the row draws its OWN lead (the leaf's label · the `i` · the gloss) plus the action
   * cell, and `children` render BELOW it across every track. That is the shape a picker, a canvas or a
   * card grid needs — a `Field`'s two-column anatomy cannot hold one, and hand-rolling the label beside it
   * (which three sections did) re-spells the lead in a third voice per section.
   */
  readonly span?: boolean;
  /**
   * A composite row's DEPENDENT fields, rendered below the row's own control inside the SAME row.
   *
   * ONE ADDRESS IS ONE DOM ROW (#932): auto-swipe mounted THREE `SettingRow`s all naming `auto-swipe`, so
   * one setting painted three modified rails, three action cells and three `i`s, and every one of them
   * reset the same top-level `autoSwipe` object. The details live here instead. The annotation is
   * re-published as `null` around them, so the gloss and the teacher door are stated exactly once.
   */
  readonly details?: ReactNode;
  readonly children: ReactNode;
}

/** The `i` tooltip. The GLOSS already answered "what this is", so the trigger answers what the pane adds
 *  and the row cannot: what moves when this moves. `affects` is non-empty by the R-TEACH honesty arm. */
function affectsHint(teach: SettingTeach): string {
  return `Affects ${teach.affects.join(" · ")}.`;
}

/** The row's trailing cell. An UNDECLARED leaf gets an EMPTY placeholder, never an action menu: its
 *  address is not in the registry, so "Copy setting id" would mint a spelling nothing resolves. The cell
 *  is still rendered so the row keeps its grid cells and the section's action track stays one column. */
function RowActionsCell({
  address,
  label,
  binding,
}: {
  readonly address: ConfigLeafAddress;
  readonly label: string | undefined;
  readonly binding: ConfigLeafValue | null;
}): ReactElement {
  if (label === undefined) {
    return <span aria-hidden={true} data-slot="setting-row-actions-absent" />;
  }
  return <SettingRowActions address={address} binding={binding} label={label} />;
}

/** THE MODIFIED MARK (§3.4 — the VS Code left bar, a designed mark) and its a11y twin. The bar is paint
 *  only (`aria-hidden`), vertically inset + rounded so it reads as a mark rather than a border, and
 *  ABSOLUTE — out of flow, so the rest row is byte-identical whether or not a rail exists (the owner's
 *  zero-shift bar). `-left-2` sits it in the section's gutter, off the label's ink. The sr-only sentence
 *  is the telling a screen reader gets instead. */
function ModifiedMark({ modified }: { readonly modified: boolean }): ReactElement | null {
  if (!modified) {
    return null;
  }
  return (
    <>
      <Row aria-hidden={true} className="-left-2 absolute inset-y-1 border-l-2 border-l-primary/60" data-slot="setting-modified-rail" />
      <Text as="span" className="sr-only">
        Modified from its default.
      </Text>
    </>
  );
}

interface RowBodyProps {
  readonly annotation: ConfigRowAnnotation | null;
  readonly actions: ReactElement;
  readonly children: ReactNode;
}

/** The FULL-SPAN lead: the leaf's name, its adjacent `i`, its gloss — then the canvas below, across every
 *  track. The lead is spelled once HERE rather than in each section that draws a picker, which is how the
 *  re-drive's "three label voices in Looks" happened. */
function SpanRowBody({ annotation, actions, label, children }: RowBodyProps & { readonly label: string }): ReactElement {
  return (
    <>
      {/* `@lg:` — the same container step the group's track set uses. Ungated, `col-span-2` in the ONE-column
          narrow arm mints an implicit second column instead of stacking. */}
      <Stack className="min-w-0 @lg:col-span-2" data-slot="setting-row-lead" gap="tight">
        <Text as="span" className="inline-flex items-center gap-field" voice="label">
          {label}
          {annotation === null ? null : (
            <HintTrigger className="text-muted-foreground hover:text-foreground" hint={annotation.hint} onClick={annotation.onHintClick} subject={label} />
          )}
        </Text>
      </Stack>
      {actions}
      {/* The gloss takes its OWN full-width line, exactly as a `<Field>`'s description does in track mode:
          prose in a label track wraps to four lines and re-inflates the row the track set exists to
          tighten. The group's `max-w-(--reading-measure)` bounds the BLOCK; this paragraph carries its own
          `--reading-measure-prose` (#1145), because a `ch` resolves in the element's own font and the
          group's cap is computed at the label step, not at the gloss's 10.5px one. */}
      {annotation === null ? null : (
        <Text className="col-span-full min-w-0 max-w-(--reading-measure-prose)" data-slot="setting-row-gloss" voice="gloss">
          {annotation.gloss}
        </Text>
      )}
      {/* `null` annotation: a canvas row states its gloss ONCE, in the lead above — a bound field inside
          the canvas must not restate it. `align="block"` ends the subgrid chain here: a canvas is arbitrary
          content in a full-width block, and a `track`-aligned `<Field>` outside a real subgrid degrades to
          a one-column grid (MEASURED: its control column collapsed to 58px and the input inside to 0). */}
      <ConfigRowAnnotationProvider value={null}>
        <FieldLayout align="block" orientation="horizontal">
          <Stack className="col-span-full min-w-0" data-slot="setting-row-body" gap="field">
            {children}
          </Stack>
        </FieldLayout>
      </ConfigRowAnnotationProvider>
    </>
  );
}

/** The ordinary two-track row: the `<Field>` takes the label and control tracks (it reads the annotation
 *  through `useBoundField`), the action cell takes the third, and a composite's dependents drop below. */
function FieldRowBody({ annotation, actions, details, children }: RowBodyProps & { readonly details: ReactNode }): ReactElement {
  return (
    <>
      <ConfigRowAnnotationProvider value={annotation}>{children}</ConfigRowAnnotationProvider>
      {actions}
      {details === undefined ? null : (
        // The dependents CONTINUE the subgrid chain rather than opening a flex block, so each one lands its
        // own label and control in the SECTION's tracks — a dependent reads as a member of the same column
        // as its master, which is the point of consolidating them into one row. (A flex block here put a
        // `track`-aligned Field outside a real subgrid, where `grid-cols-subgrid` degrades to `none`: its
        // control column measured 58px and the number input inside it 0px.)
        <ConfigRowAnnotationProvider value={null}>
          <Grid className="col-span-full min-w-0 grid-cols-subgrid gap-x-block gap-y-field" data-slot="setting-row-details">
            {details}
          </Grid>
        </ConfigRowAnnotationProvider>
      )}
    </>
  );
}

export function SettingRow({ settingId, span = false, details, children }: SettingRowProps): ReactElement {
  const scope = use(TeachScopeContext);
  const match = useConfigSearchMatch();
  const hoverTimer = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  // The per-leaf value seam (§3.4 row chrome, #866): null outside a scope, without a provider, or on a
  // leaf that declares no `key` — every null means "no value chrome", never an error.
  const binding = useConfigLeaf(scope === null ? null : { group: scope.group, sub: scope.sub.id, setting: settingId });
  // A dismount mid-delay must not teach a row that is gone.
  useEffect(
    () => (): void => {
      if (hoverTimer.current !== null) {
        globalThis.clearTimeout(hoverTimer.current);
      }
    },
    [],
  );
  if (scope === null) {
    // Outside a teach scope (a component reused on a non-config surface) the wrapper is inert layout —
    // publishing an address it cannot know would be a lie.
    return <>{children}</>;
  }
  const { group, sub } = scope;
  const leaf = (sub.settings ?? []).find((s) => s.id === settingId);
  const teach = leaf === undefined || isTeachNone(leaf.teach) ? null : leaf.teach;
  const focusSelf = (): void => setConfigFocus({ group, sub: sub.id, setting: settingId });
  const openTeacher = (): void => {
    focusSelf();
    revealContextPanel();
  };
  const annotation: ConfigRowAnnotation | null =
    teach === null ? null : { gloss: settingGloss(teach.summary), hint: affectsHint(teach), onHintClick: openTeacher };
  // THE F-8 PULL REVELATION: a fine pointer that RESTS on a row teaches it; a travel-through never does,
  // and a coarse pointer never does at all (there is no hover to rest). The ref is read INSIDE the
  // handlers, never during render — `react-hooks/refs` rejects even passing it to a helper from here.
  const onPointerEnter = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.pointerType !== "mouse") {
      return;
    }
    hoverTimer.current = globalThis.setTimeout(focusSelf, HOVER_FOCUS_DELAY_MS);
  };
  const onPointerLeave = (): void => {
    if (hoverTimer.current !== null) {
      globalThis.clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  };
  const isMatch = match !== null && match.group === group && match.sub === sub.id && match.setting === settingId;
  const modified = binding?.modified === true;
  const actions = <RowActionsCell address={{ group, sub: sub.id, setting: settingId }} binding={binding} label={leaf?.label} />;
  return (
    // The handlers are a PASSIVE observation surface — they publish which setting the pane teaches, never
    // an action; the interactive elements inside (the control, the `i`) keep their own semantics, and the
    // keyboard path is the focus-within capture.
    // `group/setting` (NAMED — a bare `group` would key the action cell's reveal on any ancestor's hover) +
    // `relative` for the modified rail, which is ABSOLUTE (out of flow — the rest row is byte-identical
    // whether or not a rail exists; the owner's zero-shift bar). `col-span-full grid grid-cols-subgrid` is
    // the middle link of the section's subgrid chain.
    <Grid
      className={cn("group/setting relative col-span-full grid-cols-subgrid items-start gap-x-block", isMatch ? "rounded-control bg-accent" : undefined) ?? ""}
      data-modified={modified ? "" : undefined}
      data-search-match={isMatch ? "" : undefined}
      data-setting={settingId}
      data-slot="setting-row"
      onClickCapture={focusSelf}
      onFocusCapture={focusSelf}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <ModifiedMark modified={modified} />
      {span ? (
        <SpanRowBody actions={actions} annotation={annotation} label={leaf?.label ?? settingId}>
          {children}
        </SpanRowBody>
      ) : (
        <FieldRowBody actions={actions} annotation={annotation} details={details}>
          {children}
        </FieldRowBody>
      )}
    </Grid>
  );
}

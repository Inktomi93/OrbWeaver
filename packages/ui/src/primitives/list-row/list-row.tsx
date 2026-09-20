// THE ROW'S ACCESSIBLE-NAME CONTRACT (#512, owner ruling 2026-08-23 — accept + document): the clickable
// row's NAME is `title` (+ ` · titleQualifier` when present), and the SUBTITLE reaches AT as the row's
// DESCRIPTION (aria-describedby), never the name. Consequence, accepted deliberately: axe's
// `label-content-name-mismatch` (weight 0, hidden group) fires on every subtitled row, because axe
// concatenates ALL text inside the button as "visible label" while the name carries only the title line.
// The substance is satisfied — the name CONTAINS the visible title verbatim (voice control works), and
// low-verbosity/AT users are spared a name that reads the whole meta line on every row. The two refused
// arms and their costs: folding the subtitle into the name (verbose announcements at every call site) and
// moving the subtitle out of the button (the hit target shrinks to the title line). Do not "fix" the axe
// rule here without reopening #512's ruling.
import type { MouseEventHandler, ReactElement, ReactNode } from "react";
import { useId } from "react";
import type { Slots } from "./parts.tsx";
import { ListRowContent } from "./parts.tsx";
import { listRowVariants } from "./variants.ts";

export interface ListRowProps {
  /** Leading slot — avatar/icon, rendered before the title/subtitle stack. */
  leading?: ReactNode;
  /**
   * The row's primary label. Typed as a plain string (not `ReactNode`) because it backs the
   * native `title=` attribute and — when `clickable` — the row's accessible name.
   */
  title: string;
  /**
   * The UNABBREVIATED title, for the native `title=` tooltip only — pass it when `title` is a deliberate
   * short form (a nav row whose full section name does not fit its column). Defaults to `title`. It never
   * touches the accessible name, which stays the VISIBLE `title` (WCAG 2.5.3 label-in-name: a spoken name
   * that doesn't contain the read label breaks voice control).
   */
  fullTitle?: string;
  /**
   * A DISAMBIGUATOR for a row whose TITLE collides with another row's — appended to the clickable row's
   * accessible name AND rendered after the title as `"<title> · <qualifier>"`. For a list whose titles
   * genuinely collide (three characters named "Emily" as three identical `button "Emily"`, #492): the
   * caller decides what disambiguates (`rowActionSubject`, #443/#458/#463) and this carries it into the
   * NAME, which `subtitle` cannot — a description is what low-verbosity and voice-control modes drop.
   *
   * IT IS RENDERED (#517, side-eye se-verify-1 — it used to be accessible-name-only, documented "never
   * rendered"). The prefix reading of WCAG 2.5.3 is what made hiding it defensible; it also left the
   * SIGHTED reader of two identically-titled rows with no disambiguator at all except whatever the
   * `subtitle` happened to be, which is a caller's fallback ladder and not a promise. Rendering the
   * qualifier satisfies 2.5.3 the stronger way — BY IDENTITY: the visible label and the accessible name
   * are the same string, so a voice user says exactly what is on screen. */
  titleQualifier?: string;
  /** Optional secondary line (subtitle/meta — one slot, caller's call which it means). */
  subtitle?: string;
  /** Opts a functional subtitle into the ratified label step instead of the instrument tier's micro gloss. */
  subtitleStep?: "default" | "label";
  /**
   * WHERE the subtitle sits. `block` (default) is the two-line entity row. `inline` puts it on the TITLE
   * LINE after the name — the instrument-row grammar (the preset rack's name + scent), where the subtitle
   * takes the flexing column and the title keeps a width floor so the identifier can never be squeezed to
   * nothing. `column` is `inline` with the name cell pinned to `--width-label-col`, so a whole DECK of rows
   * shares one gloss left-edge and one gloss width instead of one per name length (R-7).
   */
  subtitlePlacement?: "block" | "inline" | "column";
  /**
   * Drops the subtitle out of the accessible tree (`aria-hidden`, and out of `aria-describedby`). For a
   * subtitle that is a DECORATIVE echo of content the row already announces or that a screen reader has no
   * use for — e.g. a truncated mono preview of a 600-character template body, which otherwise gets read out
   * whole as the row's description. The subtitle stays visible; only the announcement drops.
   */
  subtitleDecorative?: boolean;
  /**
   * Lets a GLOSS subtitle wrap to two clamped lines instead of truncating to one. For rows whose
   * subtitle is a sentence (the home jump grid's per-section teaching copy); leave it off for dense
   * list panes, where one scannable line per row is the point.
   */
  subtitleWrap?: boolean;
  /**
   * Optional trailing meta on the title line (e.g. a relative-time stamp) — rendered INSIDE the row's
   * accessible content so screen readers keep it, unlike a stamp stranded in the `actions` sibling. Part
   * of the row's `aria-describedby`, never its name (the name stays the `title` alone).
   */
  meta?: string;
  /**
   * Rest-VISIBLE state markers (a game glyph, a pressed star, an "Archived" badge) — rendered on the TITLE
   * LINE beside `meta`, inside the content column. That is what lets a row whose CONTROLS are all
   * hover-revealed float its whole `actions` cluster (`actionsFloat`) unconditionally: markers earn their
   * width where the text already is, instead of pinning an in-flow trailing cluster the controls hide in.
   * Their labels ride the row's `aria-describedby` (like `subtitle`/`meta`), so the datum survives for a
   * screen reader even though the body's accessible NAME stays the `title` alone. Glyph-scale content only.
   */
  markers?: ReactNode;
  /**
   * A glyph/chip rendered at the HEAD OF THE SUBTITLE LINE, inside the subtitle's own span — for a status
   * mark that belongs to the row's SCENT rather than to its name (a document's ingest phase: `Indexing` ·
   * `Queued` · `Empty`, absent once the row is ready).
   *
   * Distinct from `markers`, which rides the TITLE line: a variable-width chip beside the title steals the
   * name's width on exactly the rows that have one ("Duskwater B…" at the 320px pane floor — measured, not
   * theorized), which is the same harm that moved status marks off the leading slot in the first place
   * (side-eye P2-6). The subtitle line has slack the title line does not.
   *
   * It sits INSIDE the subtitle span, so its text rides the row's `aria-describedby` with the subtitle and
   * needs no id of its own. Phrasing content only (a Badge/Icon), like every other slot in the body.
   */
  subtitleLead?: ReactNode;
  /**
   * Optional hover/:focus-within reveal that display-swaps the `subtitle` on the same content-
   * column line. Lives in the content column (never `actions`), so it truncates within the
   * column rather than contending with trailing buttons for width. Requires `subtitle` to swap against.
   */
  subtitleReveal?: string;
  /**
   * Trailing actions. Rendered as a sibling of the clickable body, never nested inside it.
   */
  actions?: ReactNode;
  /**
   * Lets the `actions` cluster drop to its OWN LINE beneath the identity once the row itself is narrower
   * than `@lg` (32rem) — a container query on the row's own box, never the viewport's. For a row whose
   * controls are REST-VISIBLE and therefore cannot buy the identity any width by hiding: below that width
   * the name and the cluster stop fitting on one line, and the name is what loses (#2486, measured at the
   * 486px settings body). Mutually exclusive with `actionsFloat`, which answers the same squeeze for a
   * cluster that is hidden at rest. The stacked cluster is still a SIBLING of the body — stacking is a
   * layout arm, never a change to what the row's `<button>` contains (#512).
   */
  stackActions?: boolean;
  /**
   * Lifts the `actions` cluster OUT OF FLOW at the row's inline end (fine pointers only), so a cluster
   * that is HIDDEN at rest stops reserving width the title/subtitle need. Pass it for a row whose
   * trailing controls are ALL hover-revealed; a rest-VISIBLE marker (a pressed star, a badge) belongs in
   * flow, where it can't sit on top of the text. Requires the row root to carry `group` (the reveal +
   * this slot's backdrop both key on it).
   */
  actionsFloat?: boolean;
  /**
   * WHICH box wears the hover/selected tint. Default `body`. Pass `row` when the `actions` cluster is IN
   * FLOW and reveal-gated: the cluster is a sibling of the body, so a body-painted tint stops before it and
   * the controls sit on the pane background instead of on the row. `row` paints the ROOT, so the glyphs ride
   * the row's own tint and the cluster needs no backdrop of its own (a cluster backdrop is a box-in-box
   * double highlight). Mutually exclusive with `actionsFloat` by construction — a floated cluster is already
   * inside the body's box.
   */
  rowTint?: "body" | "row";
  /**
   * Renders the row's body as a native `<button>`, with the `actions` slot kept a sibling so
   * nothing interactive nests inside it. The body's children are all phrasing content, so a
   * native `<button>` is valid.
   */
  clickable?: boolean;
  /** Marks the row as the current selection (`data-selected` skin + `aria-current`). */
  selected?: boolean;
  /**
   * Marks a clickable row as a DISCLOSURE header (`aria-expanded`) — the row owns a group of child rows
   * that render below it while open. Use it INSTEAD OF `selected` on a parent whose children carry the
   * "you are here" marker: `aria-current` on both a parent and its child announces two current items for
   * one location (side-eye 2026-08-01, the settings nav). Ignored on a non-clickable row (a static div
   * has nothing to expand).
   */
  expanded?: boolean;
  /** Disables the click affordance: removed from tab order, `aria-disabled`, dimmed. */
  disabled?: boolean;
  /** `compact` tightens the row to the sm control height for dense surfaces. */
  density?: "default" | "compact";
  /**
   * The TITLE's type step. `default` (the tier's own — `body` at form, `label` at instrument) is right for
   * every dense list. `promoted` takes the `title` step for a list whose rows ARE a surface's content
   * rather than a directory of it — home's also-open rooms, which the approved ramp assigns 16px. See
   * `variants.ts` for why it travels as a data attribute rather than a class.
   */
  titleStep?: "default" | "promoted";
  onClick?: MouseEventHandler<HTMLButtonElement>;
  className?: string;
}

/**
 * ListRow — the slot-based entity row every list surface composes: leading slot → title/subtitle
 * stack → trailing actions. Domain-agnostic — slots + props only.
 *
 * A11y-critical: when `clickable`, the row's body (leading + title/subtitle) is one native
 * `<button>` element — `actions` renders as a sibling outside that body, never nested inside it
 * (nested interactive content inside a button is invalid for assistive tech). The body's own
 * children are strictly phrasing content, so the native `<button>` is valid HTML.
 */
/** The body wrapper: a native `<button>` when `clickable`, else a static `<div>`. Split out to keep
 *  the clickable/selected/disabled branching off the composition root's complexity. */
function ListRowBody({
  slots,
  clickable,
  selected,
  expanded,
  disabled,
  onClick,
  ariaLabel,
  ariaDescribedBy,
  children,
}: {
  slots: Slots;
  clickable: boolean;
  selected: boolean;
  expanded: boolean | undefined;
  disabled: boolean;
  onClick: MouseEventHandler<HTMLButtonElement> | undefined;
  /** The row's accessible name — the `title` plus a caller-supplied `titleQualifier` when the list's titles
   *  collide (set only on the clickable button body). */
  ariaLabel: string;
  /** Space-joined subtitle/meta ids, or undefined when the row has neither descriptor. */
  ariaDescribedBy: string | undefined;
  children: ReactNode;
}): ReactElement {
  const ariaCurrent = selected ? "true" : undefined;
  if (!clickable) {
    // Non-clickable rows are a static <div> body — no role, no tab stop, no name/description (the visible
    // title/subtitle text stands on its own); onClick is honored only when clickable.
    return (
      <div aria-current={ariaCurrent} className={slots.body()} data-selected={selected ? "" : undefined} data-slot="list-row-body">
        {children}
      </div>
    );
  }
  // aria-disabled (not the native disabled attribute) keeps a disabled row focusable + announced;
  // dropping onClick neutralizes activation with no pointer-events CSS trick needed. aria-label pins the
  // name to the title (the title span is aria-hidden), and aria-describedby carries the subtitle + meta so
  // they survive for SR users without polluting the name (the whole point of finding #1).
  return (
    <button
      aria-current={ariaCurrent}
      aria-describedby={ariaDescribedBy}
      aria-disabled={disabled ? true : undefined}
      aria-expanded={expanded}
      aria-label={ariaLabel}
      className={slots.body()}
      data-disabled={disabled ? "" : undefined}
      data-selected={selected ? "" : undefined}
      data-slot="list-row-body"
      onClick={disabled ? undefined : onClick}
      tabIndex={disabled ? -1 : 0}
      type="button"
    >
      {children}
    </button>
  );
}

export function ListRow({
  leading,
  title,
  titleQualifier,
  fullTitle,
  subtitle,
  subtitleLead,
  subtitleReveal,
  subtitleWrap = false,
  subtitlePlacement = "block",
  subtitleDecorative = false,
  subtitleStep = "default",
  meta,
  markers,
  actions,
  actionsFloat = false,
  stackActions = false,
  rowTint = "body",
  clickable = false,
  selected = false,
  expanded,
  disabled = false,
  density = "default",
  titleStep = "default",
  onClick,
  className,
}: ListRowProps): ReactElement {
  const slots = listRowVariants({ density, clickable, float: actionsFloat, stackActions, subtitleWrap, subtitlePlacement, rowTint, titleStep });
  // Stable per-row id base for the describedby wiring; the subtitle/meta ids only attach where the slot renders.
  const baseId = useId();
  const subtitleId = subtitle === undefined || subtitleDecorative ? undefined : `${baseId}-subtitle`;
  const metaId = meta === undefined ? undefined : `${baseId}-meta`;
  const markersId = markers === undefined ? undefined : `${baseId}-markers`;
  const describedBy = [subtitleId, metaId, markersId].filter((id) => id !== undefined).join(" ") || undefined;
  return (
    // `data-selected` rides the ROOT as well as the body: the `rowTint="row"` arm paints the selected skin
    // here, and an attribute the default arm simply doesn't style costs nothing.
    <div className={slots.root({ className })} data-selected={selected ? "" : undefined} data-slot="list-row-root">
      <ListRowBody
        ariaDescribedBy={describedBy}
        ariaLabel={titleQualifier === undefined ? title : `${title} · ${titleQualifier}`}
        clickable={clickable}
        disabled={disabled}
        expanded={expanded}
        onClick={onClick}
        selected={selected}
        slots={slots}
      >
        <ListRowContent
          clickable={clickable}
          fullTitle={fullTitle}
          ids={{ subtitleId, metaId, markersId }}
          leading={leading}
          markers={markers}
          meta={meta}
          slots={slots}
          subtitle={subtitle}
          subtitleDecorative={subtitleDecorative}
          subtitleStep={subtitleStep}
          subtitleInline={subtitlePlacement !== "block"}
          subtitleLead={subtitleLead}
          subtitleReveal={subtitleReveal}
          title={title}
          titleQualifier={titleQualifier}
          titleStep={titleStep}
        />
      </ListRowBody>
      {actions === undefined ? null : (
        <div className={slots.actions()} data-slot="list-row-actions">
          {actions}
        </div>
      )}
    </div>
  );
}

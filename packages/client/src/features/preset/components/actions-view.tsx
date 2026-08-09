// The ACTIONS view (preset-surface-redesign.md §3/§6 · the Actions-tab IA,
// docs/design/actions-tab-information-architecture.md) — every prompt template the preset authors, as ONE
// instrument list. D132 made this tab the one home for authorable prompt text, which took it from 15 rows to
// 67; the IA that carries that: kind kickers (unchanged), disclosure-banded SUB-CLUSTERS for the kind that
// outgrew a glance (extract, 41 rows — collapsed by default, the config collection-group grammar), and a
// tab-level filter (67 > COLLECTION_LARGE_GROUP). Mock: `mocks/preset-redesign/actions-and-sections.html`.
//
// EVERY CELL IS REGISTRY-DERIVED (§6.6): groups, cluster bands, row copy and the drill-in's fields all come
// from `TEMPLATE_DEFS` in `@orb/contracts/preset`. A new template is one enum member + one def row (+ a
// `cluster` iff its kind bands), and nothing in this file enumerates templates.
//
// THIS LIST IS A FIXED PRODUCT ENUM, NOT A MANAGEABLE COLLECTION (§5.0, and §16 row 31 pins the ABSENCE):
// no toggles, no drag handles, no Add. An action always resolves SOME template — empty means the default
// rides, and the fixed enum cannot be "off", so turning Impersonate's template off would leave a button
// firing nothing. The manageable list is the RACK, in the Prompt view. A manage affordance appearing here
// is the §5.0 conflation rebuilt as a defect. (A cluster band's disclosure is NAVIGATION, not management —
// the same chevron grammar the Configuration roster's collapsed groups speak.)
//
// FIRES-ON IS DESCRIPTIVE (owner, verbatim: "the triggers and fires-on for a template is just
// informational — we wouldn't want to disable something we shouldn't; the actual trigger thingy is in
// prompts"). The editable trigger vocabulary exists EXCLUSIVELY in the section drill-in.
//
// The row grammar is the rack's, spoken identically (§5.0 one-list-grammar): the row body SELECTS and the
// trailing chevron DRILLS. Selection writes through the ONE `selectPresetTemplate` store action; nothing here
// reads it back (the readout is the reader). THE DRILL IS STORE STATE TOO (`useDrilledPresetTemplateId`, IA
// §2.6): the built-in's copy-on-write retarget remounts the whole keyed editor session, and a local drill id
// died with it — dumping the author from the editor to the top of a 67-row list mid-sentence. The drilled id
// is a REGISTRY id, so the restored drill-in re-anchors to the forked preset's same slot by plain read-back.
//
// THE PER-ROW KIND CHIP IS GONE FROM THE LIST (IA §2.1, X-7 anti-echo): under a kind-titled kicker the chip
// discriminated NOTHING on any row — 41 identical `extract` chips ate the right third of every row — and its
// width now feeds the fires gloss, the cell that tells rows apart. The drill-in header keeps the chip: there
// the list context is gone and the taxonomy datum earns its ink.

import type { PromptConfig, TemplateClusterId } from "@orb/contracts/preset";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { ChevronDown, ChevronRight, ExternalLink, Icon, Search } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Section, Stack, Surface } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { useId, useState } from "react";
import type { AppFormInstance } from "#forms";
import { closePresetTemplateDrill, drillPresetTemplate, selectPresetTemplate, useDrilledPresetTemplateId, useSelectedPresetTemplateId } from "#state";
import type { TemplateRow, TemplateRowCluster } from "../lib/template-rows.ts";
import {
  ACTIONS_TAB_TEACH,
  inspectedTemplateRow,
  isCustomized,
  TEMPLATE_KIND_LABEL,
  templateGroups,
  templateRowById,
  templateStoredText,
} from "../lib/template-rows.ts";
import { TemplateDrillIn } from "./template-drill-in.tsx";

type PresetForm = AppFormInstance<PromptConfig>;

/** The three cross-link states for the `guided_instruction` marker's health. */
const MARKER_HEALTHS = ["healthy", "off", "absent"] as const;
type MarkerHealth = (typeof MARKER_HEALTHS)[number];

const MARKER_HEALTH_LABEL: Record<MarkerHealth, string> = {
  healthy: "Delivers via Guided instruction",
  off: "Guided instruction is off",
  absent: "No Guided instruction marker",
};

function markerHealth(sections: PromptConfig["sections"]): MarkerHealth {
  const marker = sections.find((s) => s.type === "marker" && s.marker === "guided_instruction");
  if (marker === undefined) {
    return "absent";
  }
  return marker.enabled ? "healthy" : "off";
}

export interface ActionsViewProps {
  readonly form: PresetForm;
  /** Reveal + select a rack section — the `guided_instruction` cross-link's target (§16 row 19: one
   *  selection writer, the same one the rack uses). */
  readonly onSelectSection: (sectionId: string) => void;
}

export function ActionsView({ form, onSelectSection }: ActionsViewProps): ReactElement {
  // WHICH body the view paints — STORE state (never local): the drill must survive the fork-retarget
  // remount (IA §2.6). A stale id (a def that left the registry) resolves to no row and the list stands.
  const drilledId = useDrilledPresetTemplateId();
  // READ-ONLY here: the row highlight mirrors the same selection the READOUT projects, so the two panes can
  // never disagree about which template is being inspected — through the SHARED `inspectedTemplateRow`
  // fallback (side-eye 2026-08-08 P2), so at tab open row 1 is visibly selected rather than the readout
  // silently describing a row nothing on screen points at.
  const selectedId = inspectedTemplateRow(useSelectedPresetTemplateId()).def.id;
  // The tab-level filter (IA §2.2 — 67 rows > COLLECTION_LARGE_GROUP, the config-roster precedent). Local
  // on purpose: the drill swaps this component's RETURN, not its mount, so the filter survives a drill
  // round-trip; no sibling region reads it.
  const [filter, setFilter] = useState("");
  // WHICH cluster bands are open (no filter active). Local: no cross-region reader, and after a fork the
  // author lands back INSIDE the drill-in, not the list — default-collapsed is the correct re-entry.
  const [openClusters, setOpenClusters] = useState<ReadonlySet<TemplateClusterId>>(new Set<TemplateClusterId>());
  const drilled = drilledId === null ? undefined : templateRowById(drilledId);
  // DRILL CARRIES THE SELECTION (side-eye F-2, the P1): drilling is a strictly stronger act than selecting,
  // so it writes BOTH axes — there is still exactly one writer per axis.
  const onDrill = (id: string): void => {
    selectPresetTemplate(id);
    drillPresetTemplate(id);
  };
  if (drilled !== undefined) {
    return <TemplateDrillIn form={form} onBack={closePresetTemplateDrill} row={drilled} />;
  }
  const filtering = filter.trim() !== "";
  const groups = templateGroups(filter);
  const toggleCluster = (id: TemplateClusterId): void => {
    setOpenClusters((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };
  return (
    <Surface tier="instrument">
      <Stack gap="section">
        <Row align="start" gap="row" justify="between">
          <Text voice="gloss">{ACTIONS_TAB_TEACH}</Text>
          <form.Subscribe selector={(state): MarkerHealth => markerHealth(state.values.sections)}>
            {(health): ReactElement => <MarkerCrossLink form={form} health={health} onSelectSection={onSelectSection} />}
          </form.Subscribe>
        </Row>

        {/* The FILTER (IA §2.2) — the config group-body's grammar, lifted to the tab because the box spans
            every group. The chrome is the host's; the matching is the row model's (`templateRowMatches`). */}
        <Row align="center" gap="tight">
          <Icon className="text-muted-foreground" icon={Search} size="sm" />
          <Input aria-label="Filter templates" onValueChange={setFilter} placeholder="Filter templates…" value={filter} />
        </Row>

        {groups.length === 0 ? (
          // The all-filtered-out state states its CONDITION (empty states are load-bearing) — a silent blank
          // list reads as a broken tab, and the next step is the filter box one row up.
          <Text voice="gloss">No template matches "{filter.trim()}" — clear the filter to see all of them.</Text>
        ) : null}

        {/* HUMAN group labels (side-eye F-30 / ARIA rec 10): the kicker rendered the registry's raw enum
            member (`steer`, `voice`, `studio`), which is a code identifier standing in for a heading. */}
        {groups.map((group) => (
          <Section key={group.kind} kicker={TEMPLATE_KIND_LABEL[group.kind]}>
            <Stack gap="tight">
              {group.rows.map((row) => (
                <TemplateListRow form={form} key={row.def.id} onDrill={onDrill} row={row} selected={row.def.id === selectedId} />
              ))}
              {group.clusters.map((cluster) => (
                <TemplateCluster
                  cluster={cluster}
                  filtering={filtering}
                  key={cluster.id}
                  onToggle={(): void => toggleCluster(cluster.id)}
                  open={openClusters.has(cluster.id)}
                >
                  {cluster.rows.map((row) => (
                    <TemplateListRow form={form} key={row.def.id} onDrill={onDrill} row={row} selected={row.def.id === selectedId} />
                  ))}
                </TemplateCluster>
              ))}
            </Stack>
          </Section>
        ))}
      </Stack>
    </Surface>
  );
}

/** One SUB-CLUSTER band + its disclosed rows (IA §2.1) — the config collection-group band anatomy (chevron ·
 *  kicker-voice label · mono count), collapsed by default: the band is the map, expanding is one click, and
 *  a collapsed band's rows are UNMOUNTED (which is most of the tab-switch commit the 67-row flat list paid).
 *
 *  WHILE THE TAB FILTER IS ACTIVE the band degrades to a STATIC sub-header over its matches: the filter
 *  decides visibility, so a disclosure would be a control whose state means nothing (and a collapsed band
 *  HIDING matches would make the filter a liar). The chevron — the only affordance — is what leaves. */
function TemplateCluster({
  cluster,
  open,
  filtering,
  onToggle,
  children,
}: {
  readonly cluster: TemplateRowCluster;
  readonly open: boolean;
  readonly filtering: boolean;
  readonly onToggle: () => void;
  readonly children: ReactNode;
}): ReactElement {
  const bodyId = useId();
  const count = cluster.rows.length;
  if (filtering) {
    return (
      <Stack gap="tight">
        <Row align="center" className="px-field" gap="tight">
          <Text as="span" className="truncate" voice="kicker">
            {cluster.label}
          </Text>
          <Text as="span" voice="datum">
            {count}
          </Text>
        </Row>
        {children}
      </Stack>
    );
  }
  return (
    <Stack gap="tight">
      {/* The band is an ISLAND, not a labelled button (the config band's own side-eye lesson): `tight`
          joints, `px-field` padding, name truncates, count is the mono datum. */}
      <Button
        aria-controls={bodyId}
        aria-expanded={open}
        className="min-w-0 flex-1 justify-start gap-tight px-field"
        intent="ghost"
        onClick={onToggle}
        size="sm"
        type="button"
      >
        <Icon icon={open ? ChevronDown : ChevronRight} size="sm" />
        <Text as="span" className="truncate" voice="kicker">
          {cluster.label}
        </Text>
        <Text as="span" voice="datum">
          {count}
        </Text>
      </Button>
      <div hidden={!open} id={bodyId}>
        {open ? <Stack gap="tight">{children}</Stack> : null}
      </div>
    </Stack>
  );
}

/** One template row: label · fires gloss · Customized state · chevron.
 *
 *  THE ROW'S LAYOUT CONTRACT (side-eye F-01, the P0): the NAME is the identifier and may never be squeezed
 *  out — it takes the `column` subtitle arm's pinned name cell, and the FIRES gloss is what shortens. */
function TemplateListRow({
  form,
  row,
  onDrill,
  selected,
}: {
  readonly form: PresetForm;
  readonly row: TemplateRow;
  readonly onDrill: (id: string) => void;
  /** This row is the SELECTED template — the readout echoes it (ListRow paints the ember bar + tint). */
  readonly selected: boolean;
}): ReactElement {
  const { def, factoryDefault } = row;
  return (
    // WHICH FIELD holds this row's text is the row model's answer, not a second copy of the split here: the
    // registry has three storage arms (guided prompt · format string · `prose` slot) and spelling the
    // ternary inline was already one home too many at two. `templateStoredText` reads "" for an unset slot,
    // which `isCustomized` treats exactly as the old `undefined` did.
    <form.Subscribe selector={(state): string => templateStoredText(state.values, def.id)}>
      {(value): ReactElement => {
        const customized = isCustomized(value, factoryDefault);
        return (
          <ListRow
            actions={
              <Row align="center" gap="field">
                {/* THE `Default` CHIP IS GONE (side-eye R-7), and now the KIND chip too (IA §2.1): one told
                    the majority they had changed nothing, the other told every row what its group heading
                    already said. The only chip left is the one that discriminates — success = you changed
                    this one — and the freed width goes to the description, the cell that tells rows apart. */}
                {customized ? (
                  <Badge intent="success" size="sm" tone="soft">
                    Customized
                  </Badge>
                ) : null}
                <Button aria-label={`Edit ${def.label}`} intent="ghost" onClick={(): void => onDrill(def.id)} size="icon" type="button">
                  <Icon icon={ChevronRight} size="sm" />
                </Button>
              </Row>
            }
            clickable={true}
            // SELECT ≠ DRILL (§16 row 23, the rack's own grammar): the body click SELECTS, so the readout's
            // resolved preview echoes THIS template; the chevron above is the way into the editor.
            onClick={(): void => selectPresetTemplate(def.id)}
            selected={selected}
            // THE P0 (side-eye F-01): the fires gloss is the row's SUBTITLE on the title line, so the
            // NAME keeps a width floor and the GLOSS is what truncates. It rode `meta` — a `shrink-0`
            // slot — which starved three rows' names to 0px and clipped a fourth.
            //
            // `column`, NOT `inline` (side-eye R-7): the `inline` arm sizes the name to its own text, so
            // this deck's gloss cells started at five different x positions and got five different
            // widths — one column, five left edges, and the longest descriptions clipped hardest. The
            // `column` arm pins the name cell, which is what the mock ("a fixed name column, then the
            // fires gloss at 1fr") always specified.
            subtitle={def.fires}
            subtitlePlacement="column"
            // TWO LINES, NOT ONE (side-eye 2026-08-08 P2). `column` fixed WHERE the gloss starts; it still
            // truncated, and on the Group-rounds cluster all seven rows lost up to 38% of their text — with
            // the DISCRIMINATING word inside the cut ("…once per other present roster member" vs "…once per
            // cast member whose card rides beside the primary"), so the one cell that tells the rows apart
            // was the cell being hidden. `subtitleWrap` is the house arm for a subtitle that is a SENTENCE:
            // clamp to two lines, raised leading. Titles fit — the name column is untouched.
            subtitleWrap={true}
            title={def.label}
          />
        );
      }}
    </form.Subscribe>
  );
}

/** The cross-link to the `guided_instruction` marker — clicking selects its rack row (§16 row 19). Without
 *  that marker every GUIDED template below resolves and is then dropped, which is exactly the fact this chip
 *  exists to make visible (its label self-scopes to the guided family; the game rows' delivery truth is the
 *  readout's, per kind — IA §2.3). */
function MarkerCrossLink({
  health,
  form,
  onSelectSection,
}: {
  readonly health: MarkerHealth;
  readonly form: PresetForm;
  readonly onSelectSection: (sectionId: string) => void;
}): ReactElement {
  const onClick = (): void => {
    const marker = form.state.values.sections.find((s) => s.type === "marker" && s.marker === "guided_instruction");
    if (marker !== undefined) {
      onSelectSection(marker.id);
    }
  };
  // The ↗ lives INSIDE the pill (side-eye F-34): the mock draws one chip, and a glyph parked outside the
  // badge reads as a second, unlabelled control sitting next to it. `size="inline"` keeps the button a
  // text-height wrapper so the pill IS the visible box, rather than a pill floating in a control box.
  return (
    <Button
      className="self-start"
      disabled={health === "absent"}
      intent="ghost"
      onClick={onClick}
      size="inline"
      title={health === "absent" ? MARKER_HEALTH_LABEL.absent : undefined}
      type="button"
    >
      <Badge intent={health === "healthy" ? "info" : "warning"} size="sm" tone="soft">
        {MARKER_HEALTH_LABEL[health]}
        <Icon icon={ExternalLink} size="xs" />
      </Badge>
    </Button>
  );
}

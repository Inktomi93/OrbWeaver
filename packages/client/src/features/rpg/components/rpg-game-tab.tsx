// The GAME tab (panel-redesign DESIGN.md §4 "Game" — the crown host-admin console): the ONE host-authored
// surface, crown-tinted so the privilege reads at the strip. SHARED lite+full (the mock's "same surface,
// fewer sections"): the autosave scalar form (steering note · delivery model · deception knobs) + the
// array/record sub-editors (cast-field schemas · relationship hints · orb-pinning) that patch `updateConfig`
// path-scoped (§12.3 Tier-3). Stat-profile is a READ display (the vocabulary the sheet keys off; editing it
// is a full-mode arm). Everything autosaves (D66 A4 — no Save buttons).
//
// HOST-ONLY: this tab's `when` is `isGameChat && isHost`, and the read (`getConfigView`) is a second,
// server-side host gate (a member gets a leak-free NOT_FOUND). Pools are APPLICABILITY-omitted here (they
// are PER-ACTOR sheet data authored on the Sheet tab; the game-wide `features.defaultPoolDefs` template
// doesn't exist yet — the flagged §12.2.7 arm).

import type { RpgConfigView, RpgTrackerCarrierClass, RpgTrackerDef } from "@orb/contracts/rpg";
import { RPG_HINT_MAX, rpgTrackerDefSchema } from "@orb/contracts/rpg";
import type { ChatId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Crown, Icon, Lock, LockOpen, Pin, PinOff, Plus, RotateCcw, Trash2 } from "@orb/ui/icons";
import { Input } from "@orb/ui/input";
import { Row, Stack } from "@orb/ui/layout";
import { TrackBar } from "@orb/ui/meter";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { TrackerValue } from "#components";
import { QueryBoundary, QueryErrorState, useInvalidation, useTRPC } from "#data";
import type { RpgPanelState } from "../hooks/use-rpg-context-state";
import { useResyncFromStory, useUpdateConfig } from "../hooks/use-rpg-mutations";
import { resolveTrackerColor, trackColorProps } from "../lib/track-color";
import { RpgDoorwayLine } from "./rpg-doorway-line";
import { GmConsoleScalars } from "./rpg-gm-scalars";
import { Kicker } from "./rpg-kicker";

/** The stat-profile READ display — the attribute vocabulary the sheet keys off (editing it is a full arm). */
function StatProfileDisplay({ config }: { readonly config: RpgConfigView }): ReactElement {
  const attrs = config.statProfile.attributes;
  return (
    <Stack gap="field">
      <Kicker>Stat profile</Kicker>
      {attrs.length === 0 ? (
        <RpgDoorwayLine>Freeform — this game steers on prose, with no attribute vocabulary.</RpgDoorwayLine>
      ) : (
        <Row gap="field" className="flex-wrap">
          {attrs.map((attr) => (
            <Badge key={attr.key} tone="soft" size="sm" {...(attr.hint === "" ? {} : { title: attr.hint })}>
              {attr.label}
            </Badge>
          ))}
        </Row>
      )}
    </Stack>
  );
}

/** Mint a stable tracker `key` from the host's label — slugged, and suffixed until unique. The key is the
 *  ONE addressing identity (values, grants, locks, the write schema all key on it), so it is minted once and
 *  never re-derived on a later rename. */
function mintTrackerKey(label: string, taken: readonly RpgTrackerDef[]): string {
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "tracker";
  const keys = new Set(taken.map((d) => d.key));
  if (!keys.has(base)) {
    return base;
  }
  let n = 2;
  while (keys.has(`${base}_${n}`)) {
    n += 1;
  }
  return `${base}_${n}`;
}

/** The carrier-class label a def's `appliesTo` reads as. An explicit ref LIST reads as "chosen" and is not
 *  cycled here (this pass authors classes; a per-actor exception is the sheet's grants/revokes) — the list is
 *  preserved verbatim through every other edit, never silently flattened to a class. */
function appliesToLabel(appliesTo: RpgTrackerDef["appliesTo"]): string {
  return Array.isArray(appliesTo) ? `chosen (${appliesTo.length})` : appliesTo;
}

/** Cycle the carrier class party → npcs → everyone → party. A def carrying an explicit list is untouched. */
function nextAppliesTo(appliesTo: RpgTrackerDef["appliesTo"]): RpgTrackerDef["appliesTo"] {
  if (Array.isArray(appliesTo)) {
    return appliesTo;
  }
  const order: RpgTrackerCarrierClass[] = ["party", "npcs", "everyone"];
  return order[(order.indexOf(appliesTo) + 1) % order.length] ?? "everyone";
}

/** ONE tracker's def row — the whole axis set on one line: shape · write · who carries it · the label ·
 *  the meter ceiling · the steering HINT (non-negotiable per the unification: it is the proven steering
 *  lever and was previously unauthorable for cast fields) · pin · lock · remove. */
function TrackerRow({
  def,
  index,
  onCommit,
}: {
  readonly def: RpgTrackerDef;
  readonly index: number;
  readonly onCommit: (next: RpgTrackerDef) => void;
}): ReactElement {
  const patch = (fields: Partial<RpgTrackerDef>): void => onCommit({ ...def, ...fields });
  return (
    <Stack gap="field">
      <Row gap="field" align="center">
        {def.shape === "meter" ? (
          <TrackBar value={1} max={1} {...trackColorProps(resolveTrackerColor(def.color, index))} className="!w-block shrink-0" />
        ) : null}
        <Badge tone="soft" size="sm">
          {def.shape}
        </Badge>
        <Badge tone="soft" size="sm" title={def.write === "delta" ? "a resource the story spends and restores" : "a state the story observes"}>
          {def.write}
        </Badge>
        <TrackerValue
          ariaLabel={`Tracker ${index + 1} label`}
          display={def.label}
          onEdit={(next): void => {
            const trimmed = next.trim();
            if (trimmed !== "") {
              patch({ label: trimmed });
            }
          }}
          className="min-w-0 flex-1"
        />
        {def.shape === "meter" ? (
          <Row gap="field" align="baseline" className="shrink-0">
            <Text as="span" size="micro" tone="muted">
              max
            </Text>
            <TrackerValue
              ariaLabel={`${def.label} max`}
              display={def.max === null ? "—" : String(def.max)}
              editValue={def.max === null ? "" : String(def.max)}
              kind="numeric"
              placeholder="none"
              onEdit={(next): void => {
                const n = Number.parseInt(next, 10);
                patch({ max: Number.isNaN(n) ? null : Math.max(1, n) });
              }}
              className="!w-avatar-lg px-field text-right tabular-nums"
              restClassName="tabular-nums"
            />
          </Row>
        ) : null}
        <Button
          intent="ghost"
          size="sm"
          className="!size-6 !p-0 shrink-0"
          onClick={(): void => patch({ pinned: !def.pinned })}
          title={def.pinned ? `Unpin ${def.label} from the band` : `Pin ${def.label} as a band orb`}
        >
          <Icon icon={def.pinned ? Pin : PinOff} size="xs" />
        </Button>
        <Button
          intent="ghost"
          size="sm"
          className="!size-6 !p-0 shrink-0"
          onClick={(): void => patch({ locked: !def.locked })}
          title={def.locked ? `Let the story write ${def.label} again` : `Lock ${def.label} — the story can no longer write it`}
        >
          <Icon icon={def.locked ? Lock : LockOpen} size="xs" />
        </Button>
        <Button intent="ghost" size="sm" className="!size-6 !p-0 shrink-0" onClick={(): void => onCommit({ ...def, key: "" })} title={`Remove ${def.label}`}>
          <Icon icon={Trash2} size="xs" />
        </Button>
      </Row>
      <Row gap="field" align="center">
        {def.subject === "game" ? (
          <Badge tone="soft" size="sm" intent="neutral" title="one reading for the whole game">
            game-wide
          </Badge>
        ) : (
          <Button intent="ghost" size="sm" onClick={(): void => patch({ appliesTo: nextAppliesTo(def.appliesTo) })} title={`Who carries ${def.label}`}>
            {appliesToLabel(def.appliesTo)}
          </Button>
        )}
        <TrackerValue
          ariaLabel={`${def.label} hint`}
          display={def.hint}
          placeholder="what this means — the story reads this…"
          onEdit={(next): void => patch({ hint: next.slice(0, RPG_HINT_MAX) })}
          tone="muted"
          className="min-w-0 flex-1"
        />
      </Row>
    </Stack>
  );
}

/** The ADD flow — a NAME is required before anything persists (the unification's default-name hygiene: the
 *  old "Add meter"/"+ Meter field" buttons instantly wrote "Pool 4"/"Meter 3" orphans into live games). The
 *  `write` axis is derived from the shape the host picks — a meter is the spend/restore arm, text and list
 *  are observations — and can be flipped on the row afterwards. */
function AddTrackerRow({ defs, onAdd }: { readonly defs: readonly RpgTrackerDef[]; readonly onAdd: (def: RpgTrackerDef) => void }): ReactElement {
  const [draft, setDraft] = useState("");
  const [subject, setSubject] = useState<RpgTrackerDef["subject"]>("actor");
  const label = draft.trim();
  const add = (shape: RpgTrackerDef["shape"]): void => {
    if (label === "") {
      return;
    }
    onAdd(
      rpgTrackerDefSchema.parse({
        key: mintTrackerKey(label, defs),
        label,
        shape,
        write: shape === "meter" ? "delta" : "set",
        subject,
        appliesTo: subject === "game" ? "everyone" : "party",
        sort: defs.length,
      }),
    );
    setDraft("");
  };
  return (
    <Stack gap="field">
      <Row gap="field" align="center">
        {/* A CREATION draft, not a datum at rest — a plain Input, exempt from display-at-rest (§12.4.1). */}
        <Input aria-label="New tracker name" value={draft} placeholder="name it first (e.g. Grit)" onValueChange={setDraft} className="h-control-sm flex-1" />
        <Button intent="ghost" size="sm" onClick={(): void => setSubject(subject === "actor" ? "game" : "actor")} title="Who this tracker belongs to">
          {subject === "actor" ? "per character" : "game-wide"}
        </Button>
      </Row>
      <Row gap="field">
        {(["meter", "text", "list"] as const).map((shape) => (
          <Button key={shape} intent="ghost" size="sm" disabled={label === ""} onClick={(): void => add(shape)}>
            <Icon icon={Plus} size="xs" /> {shape}
          </Button>
        ))}
      </Row>
    </Stack>
  );
}

/** THE TRACKERS editor — the ONE surface where every tracked field in the game is defined (the tracked-field
 *  unification §3). It replaces three surfaces that each owned a slice of the same concept: the Sheet tab's
 *  per-actor pool defs, this tab's cast-field schemas, and this tab's band-orb pin section. Whole-list replace
 *  on every commit (the wire shape); a removal writes the list without the row. */
function TrackersEditor({ chatId, config }: { readonly chatId: ChatId; readonly config: RpgConfigView }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const updateConfig = useUpdateConfig({ trpc, invalidation });
  const defs = config.trackers;
  const commit = (next: readonly RpgTrackerDef[]): void => updateConfig.mutate({ chatId, patch: { trackers: [...next] } });
  return (
    <Stack gap="field">
      <Kicker>Trackers</Kicker>
      {defs.length === 0 ? <RpgDoorwayLine>No trackers yet — name one below and the story starts keeping it.</RpgDoorwayLine> : null}
      {defs.map((def, i) => (
        <TrackerRow
          key={def.key}
          def={def}
          index={i}
          onCommit={(next): void => {
            // A row commits its whole def; the remove affordance signals itself by blanking the key.
            commit(next.key === "" ? defs.filter((_, j) => j !== i) : defs.map((x, j) => (j === i ? next : x)));
          }}
        />
      ))}
      <AddTrackerRow defs={defs} onAdd={(def): void => commit([...defs, def])} />
    </Stack>
  );
}

/** The relationship-hint editor — a `custom-label → steering gloss` record (M1; the hint glosses CUSTOM
 *  labels, per the contract). Whole-record replace on commit. */
function RelationshipHintsEditor({ chatId, config }: { readonly chatId: ChatId; readonly config: RpgConfigView }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const updateConfig = useUpdateConfig({ trpc, invalidation });
  const [draftLabel, setDraftLabel] = useState("");
  const hints = config.relationshipHints;
  const entries = Object.entries(hints);
  const commit = (next: Record<string, string>): void => updateConfig.mutate({ chatId, patch: { relationshipHints: next } });
  return (
    <Stack gap="field">
      <Kicker>Relationship hints — gloss custom labels</Kicker>
      {entries.map(([label, hint]) => (
        <Row key={label} gap="field" align="center">
          <Badge tone="soft" size="sm" intent="neutral">
            {label}
          </Badge>
          <TrackerValue
            ariaLabel={`${label} hint`}
            display={hint}
            placeholder="how this label steers…"
            onEdit={(next): void => commit({ ...hints, [label]: next.slice(0, RPG_HINT_MAX) })}
            className="min-w-0 flex-1"
          />
          <Button
            intent="ghost"
            size="sm"
            className="!size-6 !p-0 shrink-0"
            onClick={(): void => {
              const { [label]: _removed, ...rest } = hints;
              commit(rest);
            }}
            title={`Remove ${label}`}
          >
            <Icon icon={Trash2} size="xs" />
          </Button>
        </Row>
      ))}
      <Row gap="field">
        {/* A CREATION draft, not a datum at rest — a plain Input, exempt from display-at-rest (§12.4.1). */}
        <Input
          aria-label="New relationship label"
          value={draftLabel}
          placeholder="custom label (e.g. debtor)"
          onValueChange={setDraftLabel}
          className="h-control-sm flex-1"
        />
        <Button
          intent="ghost"
          size="sm"
          disabled={draftLabel.trim() === "" || draftLabel in hints}
          onClick={(): void => {
            const label = draftLabel.trim();
            if (label !== "" && !(label in hints)) {
              commit({ ...hints, [label]: "" });
              setDraftLabel("");
            }
          }}
        >
          <Icon icon={Plus} size="xs" /> Add
        </Button>
      </Row>
    </Stack>
  );
}

/** The RESYNC control (§1.3 — the host re-derive escape hatch). Host-only (this whole tab is host-gated; the
 *  `resyncFromStory` verb is a second server-side host gate). One host-initiated model call re-reads a deep
 *  story window and rebuilds the drifted panel — an honest consequence line states the cost. Disabled while a
 *  resync is in flight (the model call takes seconds); the tracker/journal repaint on settle. */
function ResyncControl({ chatId }: { readonly chatId: ChatId }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const resync = useResyncFromStory({ trpc, invalidation });
  return (
    <Stack gap="field">
      <Kicker>Resync from story</Kicker>
      <Text size="micro" tone="muted">
        Re-reads the recent story and rebuilds the tracked panel — the escape hatch when the state has drifted. Runs one model call (a few seconds); your
        hand-locked fields are never overwritten.
      </Text>
      <Row gap="field">
        <Button intent="secondary" size="sm" disabled={resync.isPending} onClick={(): void => resync.mutate({ chatId })}>
          <Icon icon={RotateCcw} size="xs" />
          {resync.isPending ? "Resyncing…" : "Resync from story"}
        </Button>
      </Row>
    </Stack>
  );
}

/** The host config read + the console body. Host-gated (the tab `when` + the server verb). */
function GmConsole({ state }: { readonly state: RpgPanelState }): ReactElement {
  const trpc = useTRPC();
  const { data: config } = useSuspenseQuery(trpc.rpg.getConfigView.queryOptions({ chatId: state.chatId }));
  return (
    <Stack gap="section" data-slot="rpg-game-tab">
      <Row gap="field" align="center">
        <Icon icon={Crown} size="sm" className="text-highlight" />
        <Text size="micro" transform="caps" weight="semibold" className="tracking-micro text-highlight">
          GM console — host only
        </Text>
      </Row>
      {/* Section order: Stat profile → TRACKERS (the unified def surface that absorbed the Sheet tab's pool
          defs, the old cast-field schemas, and the band-pin section — one vocabulary, one add flow, ONE home)
          → Relationship hints → the scalar form (Play style → Hidden channels → Steering note → Delivery
          model last). */}
      <StatProfileDisplay config={config} />
      <TrackersEditor chatId={state.chatId} config={config} />
      <RelationshipHintsEditor chatId={state.chatId} config={config} />
      <GmConsoleScalars chatId={state.chatId} config={config} />
      <ResyncControl chatId={state.chatId} />
      {/* The graduate doorway — the omitted full-only arms all point here (§4 "Graduate to full"). */}
      <RpgDoorwayLine>Full mode adds skills, combat, sessions, and the map arc — coming with the full graft.</RpgDoorwayLine>
    </Stack>
  );
}

export interface RpgGameTabProps {
  readonly state: RpgPanelState;
}

/** The Game tab — the host GM console (its own boundary; a config read failure is contained). */
export function RpgGameTab({ state }: RpgGameTabProps): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text tone="muted">Loading the console…</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="the GM console" onRetry={retry} />}
    >
      <GmConsole state={state} />
    </QueryBoundary>
  );
}

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

import type { RpgCastField, RpgConfigView } from "@orb/contracts/rpg";
import { RPG_HINT_MAX } from "@orb/contracts/rpg";
import type { ChatId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Crown, Icon, Pin, PinOff, Plus, Trash2 } from "@orb/ui/icons";
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
import { useUpdateConfig } from "../hooks/use-rpg-mutations";
import { trackColor } from "../lib/track-color";
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

/** The cast-field SCHEMA editor — the host declares which fields NPCs carry (§2.8). Whole-list replace on
 *  every commit (the wire shape); each row edits label · kind is fixed once created (a kind change is a
 *  delete+add). Tier-2 refusal: an empty label / a `meter` with max below 1 never sends. */
function CastFieldsEditor({ chatId, config }: { readonly chatId: ChatId; readonly config: RpgConfigView }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const updateConfig = useUpdateConfig({ trpc, invalidation });
  const commit = (next: readonly RpgCastField[]): void => updateConfig.mutate({ chatId, patch: { castFields: [...next] } });
  const fields = config.castFields;
  // The meter-ordinal color derivation (§12.1.2 — ONE source of truth): a meter field's swatch wears
  // `trackColor(its index among METER-kind fields in definition order)` — the SAME ordinal the Scene cast
  // cards derive, so definition and display are visibly one system (§3).
  const meterOrdinals = new Map(fields.filter((f) => f.kind === "meter").map((f, i) => [f.key, i]));
  return (
    <Stack gap="field">
      <Kicker>Cast fields — tracked on NPCs</Kicker>
      {fields.map((f, i) => (
        <Row key={f.key} gap="field" align="center">
          {f.kind === "meter" ? <TrackBar value={1} max={1} color={trackColor(meterOrdinals.get(f.key) ?? 0)} className="!w-block shrink-0" /> : null}
          <Badge tone="soft" size="sm">
            {f.kind}
          </Badge>
          <TrackerValue
            ariaLabel={`Cast field ${i + 1} label`}
            display={f.label}
            onEdit={(next): void => {
              const trimmed = next.trim();
              if (trimmed !== "") {
                commit(fields.map((x, j) => (j === i ? { ...x, label: trimmed } : x)));
              }
            }}
            className="flex-1"
          />
          {f.kind === "meter" ? (
            <Row gap="field" align="baseline" className="shrink-0">
              <Text as="span" size="micro" tone="muted">
                max
              </Text>
              <TrackerValue
                ariaLabel={`${f.label} max`}
                display={String(f.max ?? 1)}
                kind="numeric"
                onEdit={(next): void => {
                  const n = Number.parseInt(next, 10);
                  if (!Number.isNaN(n)) {
                    commit(fields.map((x, j) => (j === i ? { ...x, max: Math.max(1, n) } : x)));
                  }
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
            onClick={(): void => commit(fields.filter((_, j) => j !== i))}
            title={`Remove ${f.label}`}
          >
            <Icon icon={Trash2} size="xs" />
          </Button>
        </Row>
      ))}
      <Row gap="field">
        <Button
          intent="ghost"
          size="sm"
          onClick={(): void => commit([...fields, { key: `field_${fields.length + 1}`, label: `Field ${fields.length + 1}`, kind: "text" }])}
        >
          <Icon icon={Plus} size="xs" /> Text field
        </Button>
        <Button
          intent="ghost"
          size="sm"
          onClick={(): void => commit([...fields, { key: `meter_${fields.length + 1}`, label: `Meter ${fields.length + 1}`, kind: "meter", max: 100 }])}
        >
          <Icon icon={Plus} size="xs" /> Meter field
        </Button>
      </Row>
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
            className="flex-1"
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

/** The ORB-PINNING editor — the host picks which pools surface as band orbs beyond the auto-first-3
 *  (§4.8). The pool universe is every distinct pool NAME across the roster (from the tracker view); each
 *  toggles in/out of `features.pinnedOrbs`. Whole-list replace on commit. */
function OrbPinningEditor({ state, config }: { readonly state: RpgPanelState; readonly config: RpgConfigView }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const updateConfig = useUpdateConfig({ trpc, invalidation });
  const pinned = config.pinnedOrbs;
  // Every distinct pool name across the roster (pins address pools by name).
  const poolNames = [...new Set(state.tracker.actors.flatMap((a) => a.volatile?.pools.map((p) => p.name) ?? []))];
  if (poolNames.length === 0) {
    return (
      <Stack gap="field">
        <Kicker>Band orbs</Kicker>
        <RpgDoorwayLine>No pools yet — define pools on the Sheet tab, then pin them here to surface as band orbs.</RpgDoorwayLine>
      </Stack>
    );
  }
  const toggle = (name: string): void => {
    const next = pinned.includes(name) ? pinned.filter((n) => n !== name) : [...pinned, name];
    updateConfig.mutate({ chatId: state.chatId, patch: { pinnedOrbs: next } });
  };
  return (
    <Stack gap="field">
      <Kicker>Band orbs — pin beyond the first 3</Kicker>
      <Text size="micro" tone="muted">
        The first 3 pools always show. Pin more to surface them as band orbs.
      </Text>
      <Row gap="field" className="flex-wrap">
        {poolNames.map((name) => {
          const isPinned = pinned.includes(name);
          return (
            <Button
              key={name}
              intent={isPinned ? "secondary" : "ghost"}
              size="sm"
              onClick={(): void => toggle(name)}
              title={isPinned ? `Unpin ${name}` : `Pin ${name} as a band orb`}
            >
              <Icon icon={isPinned ? Pin : PinOff} size="xs" />
              {name}
            </Button>
          );
        })}
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
      {/* The mock's section order (game.html): Stat profile → the pools-adjacent Band-orbs section →
          Cast fields → Relationship hints → the scalar form (Play style → Hidden channels → Steering
          note → Delivery model last). The mock's "Pools — defaults for new sheets" section stays
          APPLICABILITY-omitted until `features.defaultPoolDefs` exists (§12.2.7 — pools are per-actor
          sheet data, authored on the Sheet tab). */}
      <StatProfileDisplay config={config} />
      <OrbPinningEditor state={state} config={config} />
      <CastFieldsEditor chatId={state.chatId} config={config} />
      <RelationshipHintsEditor chatId={state.chatId} config={config} />
      <GmConsoleScalars chatId={state.chatId} config={config} />
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

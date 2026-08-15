// THE STAT PROFILE editor (RV-4/RV-12) — the attribute vocabulary every character sheet keys off, authored on
// the Game tab with the same RV-8 primitives the trackers use: add (a name is required, the key is minted
// once and kept through renames), rename, the steering HINT, remove, and the value RANGE. It was a read-only
// badge row: the vocabulary existed in the schema and could not be touched from the product, which is why a
// game shipped with either the six packaged d20 attributes or none at all, and why a "freeform" game had no
// path to structure. The HINT is the same R4b lever the trackers carry — the label-as-mini-prompt IS what the
// model reads, so an unauthorable hint is a dead steering lever.
//
// The write is the whole `statProfile` through `updateConfig` (the profile is one blob — the verb replaces it),
// host-gated by the tab's `when` + the verb's own host gate.

import type { RpgConfigView, RpgStatAttributeDef, RpgStatProfile } from "@orb/contracts/rpg";
import { RPG_HINT_MAX, RPG_PROFILE_MAX_ATTRIBUTES } from "@orb/contracts/rpg";
import type { ChatId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Icon, Plus, Trash2 } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { AddRow, HintEditor, TrackerValue } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { useUpdateConfig } from "../hooks/use-rpg-mutations.ts";
import { mintDefKey } from "../lib/mint-key.ts";
import { RpgDoorwayLine } from "./rpg-doorway-line.tsx";
import { Kicker } from "./rpg-kicker.tsx";

/** The def-row surface — one bordered instrument row per definition, shared with the tracker rows so the
 *  console reads as ONE list grammar. */
export const DEF_ROW_CLASS = "rounded-base border border-border bg-card px-block py-row";

/** One attribute's row: rename · its minted key · remove, over the steering hint. */
function AttributeRow({
  attr,
  index,
  onCommit,
  onRemove,
}: {
  readonly attr: RpgStatAttributeDef;
  readonly index: number;
  readonly onCommit: (next: RpgStatAttributeDef) => void;
  readonly onRemove: () => void;
}): ReactElement {
  return (
    <Stack gap="field" className={DEF_ROW_CLASS} data-slot="rpg-attribute-row">
      <Row gap="field" align="center">
        <TrackerValue
          ariaLabel={`Attribute ${index + 1} label`}
          display={attr.label}
          onEdit={(next): void => {
            const trimmed = next.trim();
            // Tier-2 refusal: a blank label never sends (the key stays — a rename is a rename).
            if (trimmed !== "") {
              onCommit({ ...attr, label: trimmed });
            }
          }}
          className="min-w-0 flex-1"
        />
        <Badge tone="soft" size="sm" title="the machine name the sheet stores this value under — minted once, kept through renames">
          {attr.key}
        </Badge>
        <Button intent="ghost" size="glyph-md" onClick={onRemove} title={`Remove ${attr.label} from the vocabulary`}>
          <Icon icon={Trash2} size="xs" />
        </Button>
      </Row>
      <HintEditor
        ariaLabel={`${attr.label} hint`}
        hint={attr.hint}
        max={RPG_HINT_MAX}
        placeholder="what this attribute means — the story reads this…"
        onEdit={(next): void => onCommit({ ...attr, hint: next })}
      />
    </Stack>
  );
}

/** The profile's value RANGE — the band every attribute value is clamped into on commit (Tier-1).
 *  Kept ordered by construction (a max below the min is unrepresentable), so no sheet can be handed an
 *  impossible band. */
function RangeRow({ profile, onCommit }: { readonly profile: RpgStatProfile; readonly onCommit: (next: RpgStatProfile) => void }): ReactElement {
  return (
    <Row gap="field" align="center">
      <Text as="span" voice="gloss">
        Values run
      </Text>
      <TrackerValue
        ariaLabel="Attribute range minimum"
        display={String(profile.range.min)}
        kind="numeric"
        onEdit={(next): void => {
          const n = Number.parseInt(next, 10);
          if (!Number.isNaN(n)) {
            onCommit({ ...profile, range: { min: n, max: Math.max(n + 1, profile.range.max) } });
          }
        }}
        className="!w-avatar-lg px-field text-right tabular-nums"
        restClassName="tabular-nums"
      />
      <Text as="span" voice="gloss" aria-hidden={true}>
        –
      </Text>
      <TrackerValue
        ariaLabel="Attribute range maximum"
        display={String(profile.range.max)}
        kind="numeric"
        onEdit={(next): void => {
          const n = Number.parseInt(next, 10);
          if (!Number.isNaN(n)) {
            onCommit({ ...profile, range: { min: profile.range.min, max: Math.max(profile.range.min + 1, n) } });
          }
        }}
        className="!w-avatar-lg px-field text-right tabular-nums"
        restClassName="tabular-nums"
      />
      <Text as="span" voice="gloss">
        on every sheet
      </Text>
    </Row>
  );
}

/** The Stat profile section — the attribute vocabulary + its value range. */
export function RpgStatProfileEditor({ chatId, config }: { readonly chatId: ChatId; readonly config: RpgConfigView }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const updateConfig = useUpdateConfig({ trpc, invalidation });
  const profile = config.statProfile;
  const attrs = profile.attributes;
  const commit = (next: RpgStatProfile): void => updateConfig.mutate({ chatId, patch: { statProfile: next } });
  const commitAttrs = (nextAttrs: readonly RpgStatAttributeDef[]): void => commit({ ...profile, attributes: [...nextAttrs] });
  const atCap = attrs.length >= RPG_PROFILE_MAX_ATTRIBUTES;

  return (
    <Stack gap="field" data-slot="rpg-stat-profile">
      <Kicker>Stat profile</Kicker>
      {attrs.length === 0 ? (
        <RpgDoorwayLine>No attributes yet — this game steers on prose. Name one below and every character sheet grows it.</RpgDoorwayLine>
      ) : null}
      {attrs.map((attr, i) => (
        <AttributeRow
          key={attr.key}
          attr={attr}
          index={i}
          onCommit={(next): void => commitAttrs(attrs.map((a, j) => (j === i ? next : a)))}
          onRemove={(): void => commitAttrs(attrs.filter((_, j) => j !== i))}
        />
      ))}
      <AddRow
        ariaLabel="New attribute name"
        placeholder="name it first (e.g. Grace)"
        {...(atCap ? { refusal: `A profile carries at most ${RPG_PROFILE_MAX_ATTRIBUTES} attributes — remove one to add another.` } : {})}
        actions={[
          {
            key: "attribute",
            label: "Add attribute",
            icon: Plus,
            onAdd: (label: string): void =>
              commitAttrs([
                ...attrs,
                {
                  key: mintDefKey(
                    label,
                    attrs.map((a) => a.key),
                    "attribute",
                  ),
                  label,
                  hint: "",
                },
              ]),
          },
        ]}
      />
      <RangeRow profile={profile} onCommit={commit} />
    </Stack>
  );
}

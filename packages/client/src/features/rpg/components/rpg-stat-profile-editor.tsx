// THE STAT PROFILE editor — the attribute vocabulary every character sheet keys off, authored on the Game tab
// with the same primitives the trackers use: add (a name is required, the key is minted once and kept through
// renames), rename, the steering HINT, remove, and the value RANGE, so a game is never stuck with the packaged
// d20 attributes or none at all. The HINT is the same lever the trackers carry — the label-as-mini-prompt IS what the
// model reads, so an unauthorable hint is a dead steering lever.
//
// The write is the whole `statProfile` through `updateConfig` (the profile is one blob — the verb replaces it),
// host-gated by the tab's `when` + the verb's own host gate.

import type { RpgConfigView, RpgStatAttributeDef, RpgStatProfile } from "@orb/contracts/rpg";
import { RPG_HINT_MAX, RPG_PROFILE_MAX_ATTRIBUTES } from "@orb/contracts/rpg";
import type { ChatId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { HintTrigger } from "@orb/ui/hint-trigger";
import { Icon, Plus, Trash2 } from "@orb/ui/icons";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { Tip } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { useUpdateConfig } from "../hooks/use-rpg-mutations.ts";
import { mintDefKey } from "../lib/mint-key.ts";
import { RpgDoorwayLine } from "./rpg-doorway-line.tsx";
import { Kicker } from "./rpg-kicker.tsx";
import { AddRow, HintEditor, TrackerValue } from "./tracker-blocks/index.ts";

/** The def-row surface — one bordered instrument row per definition, shared with the tracker rows so the
 *  console reads as ONE list grammar. `slot` is the row's owner-CSS hook, so the card keeps it.
 *
 *  `rows="control"` floors the card's OWN rows at the pointer-conditional control-sm height, so a
 *  `size="inline"` button's touch target sits inside its own row instead of overflowing onto the next row's
 *  text; a list-level `rows="control"` only floors the card. */
export function DefRow({ slot, children }: { readonly slot: string; readonly children: ReactNode }): ReactElement {
  return (
    <Card ownSlot={slot} padding="none">
      <Stack className="px-block py-row" gap="field" rows="control">
        {children}
      </Stack>
    </Card>
  );
}

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
    <DefRow slot="rpg-attribute-row">
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
          className="flex-1 min-inline-0"
        />
        <Badge tone="soft" size="sm">
          {attr.key}
        </Badge>
        <HintTrigger
          className=""
          hint="the machine name the sheet stores this value under — minted once, kept through renames"
          subject={`${attr.label}'s key`}
        />
        <Tip text={`Remove ${attr.label} from the vocabulary`}>
          <Button aria-label={`Remove ${attr.label} from the vocabulary`} intent="ghost" size="glyph-md" onClick={onRemove}>
            <Icon icon={Trash2} size="xs" />
          </Button>
        </Tip>
      </Row>
      <HintEditor
        ariaLabel={`${attr.label} hint`}
        hint={attr.hint}
        max={RPG_HINT_MAX}
        placeholder="what this attribute means — the story reads this…"
        onEdit={(next): void => onCommit({ ...attr, hint: next })}
      />
    </DefRow>
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
          const trimmed = next.trim();
          const n = Number(trimmed);
          if (trimmed !== "" && Number.isInteger(n)) {
            onCommit({ ...profile, range: { min: n, max: Math.max(n + 1, profile.range.max) } });
          }
        }}
        className="px-field text-end"
        numeric={true}
        width="avatar-lg"
        restClassName=""
      />
      <Text as="span" voice="gloss" aria-hidden={true}>
        –
      </Text>
      <TrackerValue
        ariaLabel="Attribute range maximum"
        display={String(profile.range.max)}
        kind="numeric"
        onEdit={(next): void => {
          const trimmed = next.trim();
          const n = Number(trimmed);
          if (trimmed !== "" && Number.isInteger(n)) {
            onCommit({ ...profile, range: { min: profile.range.min, max: Math.max(profile.range.min + 1, n) } });
          }
        }}
        className="px-field text-end"
        numeric={true}
        width="avatar-lg"
        restClassName=""
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
      {/* The ROW band takes its own Stack so `rows="control"` floors the attribute/add/range rows without
          inflating the kicker above them. */}
      <Stack gap="field" rows="control">
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
    </Stack>
  );
}

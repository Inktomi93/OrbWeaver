// The cast MEMBER editor — the collection's CONTENT half (config-rail C-7: the editor is MOUNTED, one
// click from the row; B10's library-management surface). Scope, deliberately: rename + description +
// the read-only member roster + Start-chat. Member RE-COMPOSITION stays author-by-example (save the
// re-arranged room as a new cast — D61's authoring path); an in-editor character multi-select would be
// a second composer for the same artifact. The server's update verb is a FULL REPLACE, so a rename
// resends the stored members verbatim (the view carries them, knobs included).

import { rulePresetKnobBagToInputs } from "@orb/contracts/automation";
import type { RosterPresetView } from "@orb/contracts/roster-preset";
import type { CharacterId, RosterPresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import { Container, Row, Stack } from "@orb/ui/layout";
import { Heading, Text } from "@orb/ui/text";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { useInvalidation, useStartChat, useTRPC } from "#data";
import type { CollectionDetailView } from "#lib";
import { useFocusOnMount } from "#lib";
import { useApplyRosterPreset, useUpdateRosterPreset } from "../hooks/use-roster-preset-mutations.ts";

/** The stored seats, resent VERBATIM on a rename (the update verb is a full replace). The view's ids
 *  stay BRANDED end to end (`CharacterId` — brand-in-name-position; the wire's `z.input` accepts them). */
function memberInputsOf(view: RosterPresetView): {
  kind: "character";
  characterId: CharacterId;
  position: number;
  talkativeness?: number;
  disabled?: boolean;
}[] {
  return view.members.map((m) => ({
    kind: "character" as const,
    characterId: m.characterId,
    position: m.position,
    ...(m.talkativeness === null ? {} : { talkativeness: m.talkativeness }),
    disabled: m.disabled,
  }));
}

/** The stored cast RULES, resent VERBATIM on a rename (B10's rules rider — the update verb full-replaces
 *  them like every other field; without this echo a rename would silently WIPE the cast's rules). The
 *  view's resolved bag re-spells as the wire INPUT bag through the one contracts adapter. */
function ruleInputsOf(
  view: RosterPresetView,
): { rulePresetId: RosterPresetView["rules"][number]["rulePresetId"]; knobs: ReturnType<typeof rulePresetKnobBagToInputs> }[] {
  return view.rules.map((rule) => ({ rulePresetId: rule.rulePresetId, knobs: rulePresetKnobBagToInputs(rule.knobs) }));
}

export function CastMemberSurface({ view }: { readonly view: CollectionDetailView }): ReactElement {
  // The stamped-id posture: the seam's memberId is opaque; the owner re-brands through its own id space.
  const presetId = castId<RosterPresetId>(view.memberId);
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: cast } = useSuspenseQuery(trpc.rosterPreset.get.queryOptions({ presetId }));
  // B10's rules rider — titles for the cast's captured rule presets (the catalogue is static; the
  // query is gated off rules-free casts). A stored id the catalogue no longer offers falls back to the
  // raw id — degraded but visible, matching the apply's reported skip.
  const { data: ruleCatalogue } = useQuery({ ...trpc.automation.listRulePresets.queryOptions(), enabled: cast.rules.length > 0 });
  const ruleTitles = new Map((ruleCatalogue ?? []).map((preset) => [preset.id, preset.title]));
  const update = useUpdateRosterPreset({ trpc, invalidation });
  const apply = useApplyRosterPreset({ trpc, invalidation });
  const { startChat, isPending: isStarting } = useStartChat();
  // Focus lands on the surface wrapper at mount (surface-a11y-focus — the tag-member-surface idiom).
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);
  // Draft fields keyed by the loaded row; the mounted editor's Save is the one write affordance.
  const [name, setName] = useState(cast.name);
  const [description, setDescription] = useState(cast.description);
  const busy = update.isPending || apply.isPending || isStarting;
  const dirty = name.trim() !== cast.name || description !== cast.description;

  const onSave = (): void => {
    update.mutate({
      presetId,
      input: {
        name: name.trim(),
        description,
        anchorPersonaId: cast.anchorPersonaId,
        groupConfig: cast.groupConfig,
        members: memberInputsOf(cast),
        rules: ruleInputsOf(cast),
      },
    });
  };

  const onStart = (): void => {
    if (isStarting) {
      return; // one creation at a time.
    }
    // @orb-gate-ignore caught-failure-ownership(promise:startChat): startChat and apply.mutateAsync each carry their own errorToast (use-start-chat.ts, useApplyRosterPreset); the swallow only silences the unhandled-rejection warning. Ends if either mutation stops owning its failure copy.
    startChat({ characterIds: cast.members.map((m) => m.characterId), anchorPersonaId: cast.anchorPersonaId })
      .then(async (chatId) => {
        await apply.mutateAsync({ presetId, chatId });
      })
      .catch(() => undefined); // both mutations toast their own failures.
  };

  return (
    <Container>
      <Stack className="max-w-prose outline-none" data-slot="cast-member-editor" gap="section" ref={surfaceRef} tabIndex={-1}>
        <Heading level={2}>{cast.name}</Heading>
        <Field label="Name">
          <Input aria-label="Cast name" onChange={(e): void => setName(e.target.value)} value={name} />
        </Field>
        <Field label="Description">
          <Input aria-label="Cast description" onChange={(e): void => setDescription(e.target.value)} value={description} />
        </Field>
        <Row align="center" gap="field">
          <Button disabled={busy || !dirty || name.trim().length === 0} intent="primary" size="sm" onClick={onSave}>
            Save
          </Button>
          <Button disabled={busy} intent="ghost" size="sm" onClick={onStart}>
            Start chat
          </Button>
        </Row>
        <Stack gap="tight">
          <Text as="span" voice="kicker">
            Members
          </Text>
          {cast.members.map((member) => (
            <Row align="center" gap="field" key={member.characterId}>
              <Text voice="label" className="min-w-0 flex-1 truncate">
                {member.name}
              </Text>
              <Text as="span" voice="gloss">
                {member.disabled ? "muted" : (member.talkativeness ?? "")}
              </Text>
            </Row>
          ))}
          <Text voice="gloss">To re-compose the cast, arrange a room you host and save it as a new cast — the saved-casts door in Members.</Text>
        </Stack>
        {cast.rules.length > 0 ? (
          <Stack gap="tight" data-slot="cast-rules">
            <Text as="span" voice="kicker">
              Rules
            </Text>
            {cast.rules.map((rule) => (
              <Text voice="label" key={rule.rulePresetId} className="truncate">
                {ruleTitles.get(rule.rulePresetId) ?? rule.rulePresetId}
              </Text>
            ))}
            <Text voice="gloss">Applied with the cast — re-minted into the room and switched on. To change them, configure a room and save a new cast.</Text>
          </Stack>
        ) : null}
      </Stack>
    </Container>
  );
}

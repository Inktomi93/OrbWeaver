// The roster MEMBER editor — the collection's CONTENT half (config-rail C-7: the editor is MOUNTED, one
// click from the row; B10's library-management surface). Scope, deliberately: rename + description +
// the read-only member roster + Start-chat. Member RE-COMPOSITION stays author-by-example (save the
// re-arranged room as a new roster — D61's authoring path); an in-editor character multi-select would be
// a second composer for the same artifact. The server's update verb is a FULL REPLACE, so a rename
// resends the stored members verbatim (the view carries them, knobs included).

import type { RulePresetView } from "@orb/contracts/automation";
import { rulePresetKnobBagToInputs } from "@orb/contracts/automation";
import type { RosterPresetView } from "@orb/contracts/roster-preset";
import type { CharacterId, RosterPresetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import { Container, Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { MemberDrillHeader } from "#components";
import { useInvalidation, useTRPC } from "#data";
import type { CollectionMemberView } from "#lib";
import { talkativenessLevel, useFocusOnMount } from "#lib";
import { clearCollectionSelection } from "#state";
import { useUpdateRosterPreset } from "../hooks/use-roster-preset-mutations.ts";
import { useRulePresetCatalogue } from "../hooks/use-saved-rosters.ts";
import { useStartRoster } from "../hooks/use-start-roster.ts";
import { rosterRuleKnobGloss } from "../lib/roster-copy.ts";

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

/** The stored roster RULES, resent VERBATIM on a rename (B10's rules rider — the update verb full-replaces
 *  them like every other field; without this echo a rename would silently WIPE the roster's rules). The
 *  view's resolved bag re-spells as the wire INPUT bag through the one contracts adapter. */
function ruleInputsOf(
  view: RosterPresetView,
): { rulePresetId: RosterPresetView["rules"][number]["rulePresetId"]; knobs: ReturnType<typeof rulePresetKnobBagToInputs> }[] {
  return view.rules.map((rule) => ({ rulePresetId: rule.rulePresetId, knobs: rulePresetKnobBagToInputs(rule.knobs) }));
}

/** ONE stored rule as the editor shows it: what it is called, and — the whole point of the rider storing
 *  a bag rather than an id — the RESOLVED knobs, in the catalogue's own labels (side-eye P2-2). Without
 *  them the block told a host to "configure a room and save a new roster" to change values it never showed,
 *  and two rosters carrying one preset at different knobs read byte-identically. */
function RosterRuleBlock(props: {
  readonly preset: RulePresetView | undefined;
  readonly rulePresetId: RosterPresetView["rules"][number]["rulePresetId"];
  readonly knobs: RosterPresetView["rules"][number]["knobs"];
}): ReactElement {
  const { preset, rulePresetId, knobs } = props;
  const gloss = rosterRuleKnobGloss(preset, knobs);
  return (
    <Stack gap="tight">
      <Text voice="label" className="truncate">
        {preset === undefined ? rulePresetId : preset.title}
      </Text>
      {gloss === null ? null : <Text voice="gloss">{gloss}</Text>}
    </Stack>
  );
}

export function RosterMemberSurface({ view }: { readonly view: CollectionMemberView }): ReactElement {
  // The stamped-id posture: the seam's memberId is opaque; the owner re-brands through its own id space.
  const presetId = castId<RosterPresetId>(view.memberId);
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: roster } = useSuspenseQuery(trpc.rosterPreset.get.queryOptions({ presetId }));
  // B10's rules rider — the catalogue row behind each captured rule preset: its TITLE, and the knob
  // LABELS the stored bag's gloss is built from. Shared with the picker and the start door through the one
  // hook (one query key). A stored id the catalogue no longer offers falls back to the raw id — degraded
  // but visible, matching the apply's reported skip.
  const { presetOf } = useRulePresetCatalogue(true);
  const update = useUpdateRosterPreset({ trpc, invalidation });
  const start = useStartRoster();
  // Focus lands on the surface wrapper at mount (surface-a11y-focus — the tag-member-surface idiom).
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);
  // Draft fields keyed by the loaded row; the mounted editor's Save is the one write affordance.
  const [name, setName] = useState(roster.name);
  const [description, setDescription] = useState(roster.description);
  /**
   * WHAT THE EDITOR OPENED WITH — the `lib/edit-session.ts` rule in its save-button form (#1561).
   *
   * The drafts above are seeded ONCE, so `name !== roster.name` is TRUE whenever the ROW moved underneath an
   * untouched editor (another seat, another tab, an apply that renamed it). `dirty` gated the Save button
   * on exactly that comparison, so a second writer LIT UP the one write affordance on the surface and a
   * press would have sent the opened-with text back over what arrived — the suppress-a-pointless-write
   * guard performing a destructive write, which is the class in its purest form.
   *
   * A once-seeded value, not a ref: it is read during render, and refs are handler/cleanup-only here.
   */
  const [openedFrom] = useState(() => ({ name: roster.name, description: roster.description }));
  const busy = update.isPending || start.isPending;
  const dirty = name.trim() !== openedFrom.name || description !== openedFrom.description;
  // BOTH MOVED — a real conflict between two writers, surfaced rather than resolved (the tracker's third
  // case). Save stays live because saving is then a DELIBERATE overwrite; what changes is that the host is
  // told, instead of discovering it afterwards.
  const contested = dirty && (roster.name !== openedFrom.name || roster.description !== openedFrom.description);

  const onSave = (): void => {
    update.mutate({
      presetId,
      input: {
        name: name.trim(),
        description,
        anchorPersonaId: roster.anchorPersonaId,
        groupConfig: roster.groupConfig,
        members: memberInputsOf(roster),
        rules: ruleInputsOf(roster),
      },
    });
  };

  const onStart = (): void => {
    start.startRoster(roster);
  };

  return (
    <Container>
      {/* `--width-content-col` — the EDITOR content-column cap, not a reading measure (#1175). See the tag
          member editor's twin: this block holds controls, so the prose token is forbidden here by its own
          contract, and `max-w-prose` was a third un-derived width. The token's stated consumption is
          THREE classes (#1664 — centered, capped, breathing to `--width-content-col-wide` past `@5xl`);
          the tag editor's twin carries the argument and the measured pane widths. */}
      <Stack
        className="mx-auto w-full max-w-(--width-content-col) @5xl:max-w-(--width-content-col-wide) outline-none"
        data-slot="roster-member-editor"
        gap="section"
        ref={surfaceRef}
        tabIndex={-1}
      >
        {/* THE DRILL ROW (#1747, the mock design §3.4): `← Back to <library>` · the roster's name · this
            collection's ONE member verb, Start chat (§3.4 names it). SAVE STAYS WITH THE FIELDS below: it
            commits the two inputs it sits under and is not a member verb — moving it up would put a
            form's submit two rows above the form and leave the conflict notice (#1561) beside nothing. */}
        <MemberDrillHeader
          actions={
            <Button disabled={busy} intent="ghost" onClick={onStart} size="sm">
              Start chat
            </Button>
          }
          back={{ label: `Back to ${view.library}`, onClick: (): void => clearCollectionSelection() }}
          title={roster.name}
        />
        {/* NO `aria-label` on either cell (#1587). A `<Field>`'s label reaches its control through Base UI's
            `aria-labelledby`, which OUTRANKS `aria-label` in the accname algorithm — so "Roster name" /
            "Roster description" named nothing and the cells already announced "Name" / "Description"
            (measured). A dead attribute is worse than none: it reads as the announced name to the next
            author. If these ever need the qualifier, it goes on the Field's own label, where it is both
            visible and announced. */}
        <Field label="Name">
          <Input onChange={(e): void => setName(e.target.value)} value={name} />
        </Field>
        <Field label="Description">
          <Input onChange={(e): void => setDescription(e.target.value)} value={description} />
        </Field>
        <Row align="center" gap="field">
          <Button disabled={busy || !dirty || name.trim().length === 0} intent="primary" size="sm" onClick={onSave}>
            Save
          </Button>
        </Row>
        {/* The two-writer collision, STATED (#1561). It rides beside the Save it qualifies rather than at
            the top of the surface: the decision it changes is that press. */}
        {contested ? (
          <Text data-slot="roster-editor-conflict" voice="label">
            {`This roster changed elsewhere while you were editing — it is now “${roster.name}”. Saving replaces that with your text.`}
          </Text>
        ) : null}
        {/* `Section kicker` renders the SAME caps-micro band the two groupings had as bare spans — and a
            real <h3> under it (side-eye P2-5: the editor's only heading was the roster name, so heading
            navigation gave a screen-reader user one stop in a two-section surface, while the sibling
            "This chat" pane names every section at level 3). */}
        <Section kicker="Members">
          {roster.members.map((member) => (
            <Row align="center" gap="field" key={member.characterId}>
              <Text voice="label" className="min-w-0 flex-1 truncate">
                {member.name}
              </Text>
              {member.disabled ? (
                <Text as="span" voice="gloss">
                  Muted
                </Text>
              ) : (
                // ONE talkativeness spelling with the room's own Members tab (P2-5): the 0–100 dial, the
                // word "Talks", no percent sign. The scale + wording live in `#lib` (a feature may not
                // import another feature), so the roster can never drift from the room again. A seat that
                // never had the knob touched carries `null` — the room's own default weight.
                <Text as="span" voice="gloss">
                  {member.talkativeness === null ? "Talks by default" : `Talks ${talkativenessLevel(member.talkativeness)}`}
                </Text>
              )}
            </Row>
          ))}
          <Text voice="gloss" className="max-w-(--reading-measure-prose)">
            To re-compose the roster, arrange a room you host and save it as a new roster — the saved-rosters door in Members.
          </Text>
        </Section>
        {roster.rules.length > 0 ? (
          <Section kicker="Rules" data-slot="roster-rules">
            {roster.rules.map((rule) => (
              <RosterRuleBlock knobs={rule.knobs} key={rule.rulePresetId} preset={presetOf(rule.rulePresetId)} rulePresetId={rule.rulePresetId} />
            ))}
            <Text voice="gloss" className="max-w-(--reading-measure-prose)">
              Applied with the roster — re-minted into the room and switched on. To change them, configure a room and save a new roster.
            </Text>
          </Section>
        ) : null}
      </Stack>
    </Container>
  );
}

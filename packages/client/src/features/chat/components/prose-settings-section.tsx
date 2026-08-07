// The Prose settings SECTION (PROSE-1 S2) — the edit surface for every model-facing prose slot whose
// override lives in `UserSettings.prose`: the chat side-generation prompts (arbiter · compaction · memory
// digest/consolidation · the anchor-identity lead-in), the group-round framing, the `/autobg` quiet
// pick, discovery's three library-semantics prompts, and the imagery negative base. Registering `prose` in
// `USER_SETTINGS_SECTIONS` and landing this surface is ONE commit by law (D107 arm B — the section tuple is
// the editor's door, and a door with no writer is a dead switch).
//
// A settings-SECTION CONTRIBUTION at the `chat-behavior` anchor owned by features/chat (D114 reader-owns:
// chat is the reader of twelve of the eighteen slots and already owns the sibling Image-prompts section; the
// registry itself is cross-domain contracts data, so no other feature has a stronger claim, and D120 forbids
// growing features/settings — it owns the SHELL, never the knobs).
//
// The three affordances, identical to imagery + guided actions (PROSE-1 §5): the shipped default GHOSTS as
// the field placeholder (empty field = using the built-in, byte-identical), a Default/Customized footer
// carries the warn-never-block required-macro lint, and reset = clear the field (the write sends the leaf
// `null`, so removing an override actually removes it). Plus §4.4's stale affordance: an override authored
// against an older slot version offers "Use the new default" (clears) or "Keep mine" (re-stamps
// `baseVersion` through a ONE-key patch — any ordinary edit re-stamps too, so this is the no-edit path).

import type { ProseOverride, ProseOverrides, ProseSlotId } from "@orb/contracts/prose";
import { PROSE_SLOTS, USER_PROSE_SLOT_IDS } from "@orb/contracts/prose";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Grid, Row, Section, Stack } from "@orb/ui/layout";
import type { MacroSuggestion } from "@orb/ui/macro-textarea";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { createEntityMutation, QueryBoundary, QueryErrorState, useInvalidation, useTRPC } from "#data";
import type { AutosaveSession } from "#forms";
import { createAutosaveEntityForm, SectionSaveStatus } from "#forms";
import { settingsAnchorId } from "#state";
import type { ProseFooterState } from "../lib/prose-settings-model.ts";
import { PROSE_SETTINGS_SUBCATEGORY, projectProseForm, proseFieldName, proseFooterState, proseSlotPatch, toProsePatch } from "../lib/prose-settings-model.ts";

/** The form bag + the patch shape as LOCAL aliases off the model's own return types (D120: an exported
 *  patch/form alias is `no-inline-types` RED — the shape has ONE home, the function that builds it). */
type ProseForm = ReturnType<typeof projectProseForm>;
type ProsePatch = ReturnType<typeof toProsePatch>;

interface UpdateProseVars {
  readonly section: "prose";
  readonly patch: ProsePatch;
}
const useUpdateProse = createEntityMutation<UpdateProseVars, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true, // updateUserSettingsSection emits settingsChanged → USER_BUS covers getUserSettings.
  errorToast: "Couldn't save your prose overrides.",
});

const ProseAutosaveForm = createAutosaveEntityForm<ProseForm>({ defaultValues: projectProseForm({}) });

/** One row per user, so a fixed entity key. */
const PROSE_ENTITY_ID = "prose-settings";

/** Every editable slot is `macros:"none"` — the only tokens that DO anything are the slot's own
 *  pre-substitution ones (`{{name}}`, `{{note}}`), spliced by the caller as a plain replace. Offering the
 *  general macro catalogue here would promise a resolution that never runs.
 *
 *  MACU-2 EXEMPTION (owner ruling 2026-08-03: the macro plane goes everywhere macros WORK — nowhere else).
 *  Re-verified against the slot TABLE, not just this comment: of the 28 `PROSE_SLOTS` rows, all 11
 *  `macros:"full"` slots are `home:"preset"` (edited in the preset editor, which already composes the user
 *  plane through `PresetMacroSuggestions`), and every slot THIS section edits — `USER_PROSE_SLOT_IDS`, the
 *  `home:"user"` set — is `macros:"none"`, i.e. the bytes ship verbatim, braces and all. There is no server
 *  change that would make a user macro resolve here short of changing a slot's declared macro MODE, which is
 *  a PROSE-1 product decision about what those bytes mean to the summarizers/memory/arbiter that read
 *  them — not a client wiring gap. */
function slotSuggestions(id: ProseSlotId): readonly MacroSuggestion[] {
  return PROSE_SLOTS[id].requiredMacros.map((macro) => ({
    name: macro.replaceAll(/[{}]/gu, ""),
    category: "slot",
    description: "Replaced with this slot's own value when the prompt is built.",
  }));
}

/** The Prose section body — mounted at the chat-behavior pane's contributed-sections anchor. */
export function ProseSettingsSection({ sectionId }: { readonly sectionId: string }): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text voice="gloss">Loading your prose overrides…</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="your prose overrides" onRetry={retry} />}
    >
      <ProseFormBody sectionId={sectionId} />
    </QueryBoundary>
  );
}

function ProseFormBody({ sectionId }: { readonly sectionId: string }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const update = useUpdateProse({ trpc, invalidation });
  const stored: ProseOverrides = data.config.prose;

  const save = (values: ProseForm): Promise<unknown> => update.mutateAsync({ section: "prose", patch: toProsePatch(values) });
  // "Keep mine" — the ONE key-minimal write outside the form (§4.4 rung 4). The text is unchanged, so the
  // autosave driver has nothing to fire; re-stamping `baseVersion` to the current slot version is what
  // dismisses the stale chip, and it must not touch any other slot's stored override.
  const keepMine = (id: ProseSlotId, text: string): void => {
    void update.mutateAsync({ section: "prose", patch: { [id]: proseSlotPatch(id, text) } });
  };

  return (
    <ProseAutosaveForm entityId={PROSE_ENTITY_ID} serverValues={projectProseForm(stored)} save={save}>
      {(session): ReactElement => <ProseBody sectionId={sectionId} session={session} stored={stored} onKeepMine={keepMine} />}
    </ProseAutosaveForm>
  );
}

interface ProseBodyProps {
  readonly sectionId: string;
  readonly session: AutosaveSession<ProseForm>;
  readonly stored: ProseOverrides;
  readonly onKeepMine: (id: ProseSlotId, text: string) => void;
}

function ProseBody({ sectionId, session, stored, onKeepMine }: ProseBodyProps): ReactElement {
  const { form, saveState, retrySave } = session;
  return (
    <Section
      className="@container"
      divider={true}
      heading={PROSE_SETTINGS_SUBCATEGORY.label}
      id={settingsAnchorId("chat-behavior", PROSE_SETTINGS_SUBCATEGORY.id)}
    >
      <Stack gap="block">
        <Text voice="gloss">
          The wording the app sends to a model on your behalf — summarizers, the memory writer, the group turn director, and the group-round nudges. Leave a
          field blank to use the built-in wording (shown as the placeholder). In a shared room, the host's wording is the one that runs. The framings that wrap
          a turn's own prompt — the note frames and the continuation cue — live with your preset's templates, not here.
        </Text>
        <Grid cols="auto" gap="field">
          {USER_PROSE_SLOT_IDS.map((id) => (
            <ProseCard key={id} form={form} id={id} onKeepMine={onKeepMine} stored={stored[id]} />
          ))}
        </Grid>
        <SectionSaveStatus id={sectionId} state={saveState} onRetry={retrySave} caption="Synced across your devices." />
      </Stack>
    </Section>
  );
}

interface ProseCardProps {
  readonly form: AutosaveSession<ProseForm>["form"];
  readonly id: ProseSlotId;
  readonly stored: ProseOverride | undefined;
  readonly onKeepMine: (id: ProseSlotId, text: string) => void;
}

function ProseCard({ form, id, stored, onKeepMine }: ProseCardProps): ReactElement {
  const slot = PROSE_SLOTS[id];
  const name = proseFieldName(id);
  const clear = (): void => {
    form.setFieldValue(name, "");
  };
  return (
    <Stack gap="field" padding="field" role="group" aria-label={slot.title} className="rounded-base border border-border bg-card">
      <form.AppField name={name}>
        {(field): ReactElement => (
          <field.MacroField label={slot.title} description={slot.fires} suggestions={slotSuggestions(id)} placeholder={slot.text} rows={3} />
        )}
      </form.AppField>
      <form.Subscribe selector={(state): string => state.values[name] ?? ""}>
        {(value): ReactElement => (
          <ProseCardFooter
            footer={proseFooterState(id, value, stored)}
            onKeepMine={(): void => {
              onKeepMine(id, value);
            }}
            onUseDefault={clear}
          />
        )}
      </form.Subscribe>
    </Stack>
  );
}

interface ProseCardFooterProps {
  readonly footer: ProseFooterState;
  readonly onUseDefault: () => void;
  readonly onKeepMine: () => void;
}

/** Default/Customized + the warn-never-block lints + the §4.4 stale pair. Both stale actions are one click
 *  and neither is automatic — a revised default never lands behind a host's back, and a host is never
 *  silently left on a stale copy. */
function ProseCardFooter({ footer, onUseDefault, onKeepMine }: ProseCardFooterProps): ReactElement {
  return (
    <Stack gap="field">
      <Row gap="field" align="center">
        <Text voice="gloss">{footer.isDefault ? "Using the built-in wording" : "Customized"}</Text>
        {footer.isDefault ? null : (
          <Button intent="ghost" size="sm" onClick={onUseDefault}>
            Reset to built-in
          </Button>
        )}
      </Row>
      {footer.missing.length > 0 ? (
        <Row gap="field" align="center">
          {footer.missing.map((token) => (
            <Badge key={token} intent="warning" tone="soft" size="sm">
              Missing {token}
            </Badge>
          ))}
        </Row>
      ) : null}
      {footer.stale ? (
        <Row gap="field" align="center">
          <Badge intent="warning" tone="soft" size="sm">
            The built-in wording was updated
          </Badge>
          <Button intent="ghost" size="sm" onClick={onUseDefault}>
            Use the new wording
          </Button>
          <Button intent="ghost" size="sm" onClick={onKeepMine}>
            Keep mine
          </Button>
        </Row>
      ) : null}
    </Stack>
  );
}

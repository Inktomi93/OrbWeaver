// The Image-prompts settings SECTION (Phase B ⑫) — the per-user, per-mode prompt-building overrides the
// `/imagine` + auto-illustrate paths resolve. Each mode's card carries a MacroField that GHOSTS the shipped
// `@orb/contracts/imagery` catalog default via `placeholder`: an empty field = "use the shipped default"
// (byte-identical), a typed value = your override. The extraction cards resolve `{{char}}`/`{{user}}` AND the
// author's own USER MACROS (IMGMAC) through the ONE macro engine at extraction time; the caption cards are
// macro-free (the image is the subject).
//
// A settings-SECTION CONTRIBUTION (client-architecture-lockdown.md §6c) at the chat-behavior anchor: chat OWNS
// imagery consumption (the quiet-extraction shaper is chat's op; `/imagine` is chat's composer), so it
// contributes the tuning here rather than growing features/settings (the databank-section precedent). Reads
// getUserSettings (cache-first), autosaves through updateUserSettingsSection("imagery") (the guided-actions
// card idiom — MacroField per mode, ghosting the default). A blank field sends a leaf-`null` to CLEAR an
// override back to the shipped default.

import { DEFAULT_CAPTION_INSTRUCTIONS, DEFAULT_PROMPT_TEMPLATES } from "@orb/contracts/imagery";
import { Grid, Section, Stack } from "@orb/ui/layout";
import type { MacroSuggestion } from "@orb/ui/macro-textarea";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { QueryBoundary } from "#components";
import { createEntityMutation, QueryErrorState, useInvalidation, usePromptMacroSuggestions, useTRPC } from "#data";
import type { AutosaveSession } from "#forms";
import { SectionSaveStatus } from "#forms";
import { configAnchorId } from "#state";
import { IMAGERY_TEMPLATES_ENTITY_ID, ImageryTemplatesAutosaveForm } from "../hooks/use-imagery-templates-form.ts";
import type { ImageryTemplatesForm } from "../lib/imagery-templates-model.ts";
import { projectImageryTemplatesForm, toImageryTemplatesPatch } from "../lib/imagery-templates-model.ts";
import { IMAGERY_TEMPLATES_SUBCATEGORY } from "../lib/imagery-templates-section-nav.ts";

interface UpdateImageryVars {
  readonly section: "imagery";
  readonly patch: Record<string, unknown>;
}
const useUpdateImagery = createEntityMutation<UpdateImageryVars, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true, // updateUserSettingsSection emits settingsChanged → USER_BUS covers getUserSettings.
  errorToast: "Couldn't save your image-prompt templates.",
});

/** The IDENTITY macros an extraction template resolves — the two `ProcessMacroOptions` fields the shaper
 *  actually fills (`domain/chat/verbs/extract-quiet.ts`). Still hand-curated rather than the app-wide builtin
 *  catalog, because most builtins read card/turn fields the extraction context leaves empty: offering
 *  `{{description}}` here would promise a substitution that renders "". Caption cards get NO suggestions at
 *  all — their instruction is never macro-processed (the image is the subject). */
const IMAGERY_TEMPLATE_MACROS: readonly MacroSuggestion[] = [
  { name: "char", category: "character", description: "The subject character's name" },
  { name: "user", category: "persona", description: "Your persona's name" },
];

/** IMGMAC (owner ruling: YES) — the identity pair UNION the author's USER-MACRO plane. The queued question
 *  this file used to carry ("should the imagery mode-templates resolve the user-macro plane at extract
 *  time?") was answered yes, and the server half landed: `extractQuiet` now builds a per-call registry from
 *  both authoring homes (`buildTurnUserMacros` — preset defs + game defs, game shadows preset) and renders
 *  the template against it, so `{{house_rule}}` typed here genuinely substitutes.
 *
 *  WHY THE ACTIVE PRESET IS THE HONEST PLANE (the `usePromptMacroSuggestions` argument verbatim): this is a
 *  per-USER settings section with no chat and no game in scope, so the exact set that will resolve at extract
 *  time — which depends on the room's host preset and its game — is unknowable here. The user's active preset
 *  is the closest true answer; a game macro still resolves, it just cannot be advertised from here.
 *
 *  Only the plane ROWS are taken from the hook (`category === "user"`); its builtin half is the app-wide
 *  catalog, which over-promises on this surface for the reason above. */
function extractionSuggestions(plane: readonly MacroSuggestion[]): readonly MacroSuggestion[] {
  return [...IMAGERY_TEMPLATE_MACROS, ...plane.filter((s) => s.category === "user")];
}

/** One card descriptor: the form field, its human title, the "fires on" copy, whether it resolves macros, and
 *  the shipped default it ghosts as a placeholder. */
interface CardDescriptor {
  readonly field: keyof ImageryTemplatesForm;
  readonly title: string;
  readonly fires: string;
  readonly macros: boolean;
  readonly shippedDefault: string;
}

const CARDS: readonly CardDescriptor[] = [
  {
    field: "character",
    title: "Character portrait",
    fires: "A full-body image of the character from the scene",
    macros: true,
    shippedDefault: DEFAULT_PROMPT_TEMPLATES.character,
  },
  { field: "face", title: "Character face", fires: "A close-up facial portrait from the scene", macros: true, shippedDefault: DEFAULT_PROMPT_TEMPLATES.face },
  { field: "scenario", title: "Scene", fires: "An image of the current moment of the story", macros: true, shippedDefault: DEFAULT_PROMPT_TEMPLATES.scenario },
  { field: "background", title: "Background", fires: "The current location, no characters", macros: true, shippedDefault: DEFAULT_PROMPT_TEMPLATES.background },
  {
    field: "characterMultimodal",
    title: "Character portrait (from avatar)",
    fires: "A portrait captioned from the character's avatar image",
    macros: false,
    shippedDefault: DEFAULT_CAPTION_INSTRUCTIONS.character_multimodal,
  },
  {
    field: "faceMultimodal",
    title: "Character face (from avatar)",
    fires: "A face captioned from the character's avatar image",
    macros: false,
    shippedDefault: DEFAULT_CAPTION_INSTRUCTIONS.face_multimodal,
  },
];

/** The Image-prompts section body — mounted at the chat-behavior pane's contributed-sections anchor. */
export function ImageryTemplatesSection({ sectionId }: { readonly sectionId: string }): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text voice="gloss">Loading your image-prompt templates…</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="your image-prompt templates" onRetry={retry} />}
    >
      <ImageryTemplatesFormBody sectionId={sectionId} />
    </QueryBoundary>
  );
}

function ImageryTemplatesFormBody({ sectionId }: { readonly sectionId: string }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const update = useUpdateImagery({ trpc, invalidation });

  const save = (values: ImageryTemplatesForm): Promise<unknown> => update.mutateAsync({ section: "imagery", patch: toImageryTemplatesPatch(values) });

  return (
    <ImageryTemplatesAutosaveForm entityId={IMAGERY_TEMPLATES_ENTITY_ID} serverValues={projectImageryTemplatesForm(data.config.imagery)} save={save}>
      {(session): ReactElement => <ImageryTemplatesBody sectionId={sectionId} session={session} />}
    </ImageryTemplatesAutosaveForm>
  );
}

function ImageryTemplatesBody({ sectionId, session }: { readonly sectionId: string; readonly session: AutosaveSession<ImageryTemplatesForm> }): ReactElement {
  const { form, saveState, retrySave } = session;
  // IMGMAC — the author's user-macro plane, unioned onto the two identity macros for the EXTRACTION cards.
  const suggestions = extractionSuggestions(usePromptMacroSuggestions());
  return (
    <Section divider={true} heading={IMAGERY_TEMPLATES_SUBCATEGORY.label} id={configAnchorId("chat-behavior", IMAGERY_TEMPLATES_SUBCATEGORY.id)}>
      <Stack gap="block">
        <Text voice="gloss">
          How each image-generation mode builds its prompt. Leave a field blank to use the built-in default (shown as the placeholder). Your opening line still
          gets the composition prefix the size defaults expect.
        </Text>
        <Grid cols="auto" gap="field">
          {CARDS.map((card) => (
            <Stack key={card.field} gap="field" padding="field" className="rounded-base border border-border bg-card">
              <form.AppField name={card.field}>
                {(field): ReactElement => (
                  <field.MacroField
                    label={card.title}
                    description={card.fires}
                    suggestions={card.macros ? suggestions : []}
                    placeholder={card.shippedDefault}
                    rows={4}
                  />
                )}
              </form.AppField>
            </Stack>
          ))}
        </Grid>
        <SectionSaveStatus id={sectionId} state={saveState} onRetry={retrySave} />
      </Stack>
    </Section>
  );
}

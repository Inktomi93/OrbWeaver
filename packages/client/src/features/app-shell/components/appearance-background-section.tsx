// The Background appearance SECTION (SET-SEAMS stage 1) — the background image kind + its library, fit,
// scrim and blur. A settings-SECTION CONTRIBUTION at the `appearance` anchor owned by features/app-shell:
// app-shell PAINTS the background (`surfaces/app-shell.tsx` mounts the image/video layers off
// `#lib`'s `resolveThemeBackground`), so under §6 it owns the editor too.
//
// S1 — PATCH MINIMALITY: `OWNS` is spelled once and drives the projection, the seeded defaults, the form
// type and the contribution's `owns` claim. The nine background keys are ONE section deliberately — a
// newly-added background writes `backgroundLibrary` + the three `backgroundAsset*` selection fields in ONE
// patch (BG-D), so splitting them across sections would split an atomic write.

import { blobUrl } from "@orb/contracts/assets";
import type { AppearanceSettings, BackgroundLibraryEntry } from "@orb/contracts/settings";
import { DEFAULT_APPEARANCE_SETTINGS } from "@orb/contracts/settings";
import { pickKeys } from "@orb/kit/objects";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Icon, Trash2 } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import type { MediaGridItem } from "@orb/ui/media-grid";
import { MediaGrid } from "@orb/ui/media-grid";
import { MenuItem } from "@orb/ui/menu";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { ConfigTeachScope, QueryBoundary, RowActionsMenu, SettingRow, SettingRowGroup } from "#components";
import { createEntityMutation, QueryErrorState, useInvalidation, useTRPC } from "#data";
import type { AutosaveSession } from "#forms/editor";
import { createAutosaveEntityForm, SectionSaveStatus } from "#forms/editor";
import { listSeededBackgrounds } from "#lib";
import { configAnchorId } from "#state";
import { APPEARANCE_BACKGROUND_KEYS, APPEARANCE_BACKGROUND_SUBCATEGORY } from "../lib/appearance-background-model.ts";
import { BACKGROUND_BLUR_MAX, BACKGROUND_BLUR_MIN, BACKGROUND_DIM_MAX, BACKGROUND_DIM_MIN, BACKGROUND_DIM_STEP } from "../lib/appearance-bounds.ts";
import { BACKGROUND_FIT_ITEMS } from "../lib/appearance-select-items.ts";
import { BackgroundUploadField } from "./background-upload-field.tsx";
import { ExternalBackgroundField } from "./external-background-field.tsx";

type BackgroundForm = Pick<AppearanceSettings, (typeof APPEARANCE_BACKGROUND_KEYS)[number]>;

interface UpdateBackgroundVars {
  readonly section: "appearance";
  readonly patch: BackgroundForm;
}
const useUpdateBackground = createEntityMutation<UpdateBackgroundVars, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  busDriven: true, // updateUserSettingsSection emits settingsChanged → USER_BUS covers getUserSettings.
  errorToast: "Couldn't save your background settings.",
});

const BackgroundAutosaveForm = createAutosaveEntityForm<BackgroundForm>({
  defaultValues: pickKeys(DEFAULT_APPEARANCE_SETTINGS, APPEARANCE_BACKGROUND_KEYS),
});

const BACKGROUND_ENTITY_ID = "appearance-background";

/** The Background section body — mounted at the appearance pane's contributed-sections anchor. */
export function AppearanceBackgroundSection({ sectionId }: { readonly sectionId: string }): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text voice="gloss">Loading your background settings…</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="your background settings" onRetry={retry} />}
    >
      <BackgroundFormBody sectionId={sectionId} />
    </QueryBoundary>
  );
}

function BackgroundFormBody({ sectionId }: { readonly sectionId: string }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const update = useUpdateBackground({ trpc, invalidation });

  const save = (values: BackgroundForm): Promise<unknown> => update.mutateAsync({ section: "appearance", patch: values });

  return (
    <BackgroundAutosaveForm entityId={BACKGROUND_ENTITY_ID} serverValues={pickKeys(data.config.appearance, APPEARANCE_BACKGROUND_KEYS)} save={save}>
      {(session): ReactElement => <BackgroundBody sectionId={sectionId} session={session} />}
    </BackgroundAutosaveForm>
  );
}

const NONE_TILE_ID = "none";
const SEEDED_PREFIX = "seeded:";
const ASSET_PREFIX = "entry:";
const THUMB_WIDTH = 96;

interface BackgroundTile extends MediaGridItem {
  readonly apply: (form: AutosaveSession<BackgroundForm>["form"]) => void;
}

/** The picked-tile write — kind DERIVES from the tile (R-BG: `backgroundImageKind` is storage detail, not
 *  a control), and every selection field lands in ONE autosave patch (BG-D). */
function writeSeeded(form: AutosaveSession<BackgroundForm>["form"], seededId: string): void {
  form.setFieldValue("backgroundImageKind", "seeded");
  form.setFieldValue("backgroundSeededId", seededId);
}

function writeAsset(form: AutosaveSession<BackgroundForm>["form"], entry: BackgroundLibraryEntry): void {
  form.setFieldValue("backgroundImageKind", "asset");
  form.setFieldValue("backgroundAssetId", entry.assetId);
  form.setFieldValue("backgroundAssetHash", entry.assetHash);
  form.setFieldValue("backgroundAssetMime", entry.mime);
}

function writeNone(form: AutosaveSession<BackgroundForm>["form"]): void {
  form.setFieldValue("backgroundImageKind", "none");
}

function BackgroundBody({ sectionId, session }: { readonly sectionId: string; readonly session: AutosaveSession<BackgroundForm> }): ReactElement {
  const { form, saveState, retrySave } = session;
  // A newly-added background — uploaded or materialized from a URL — SAVES to the library (BG-D) and becomes
  // the live one in the same autosave patch. Byte-identical adds legitimately produce two rows: `assetId` is
  // content-addressed and shared, `entryId` is the per-row identity (F-P2), so no de-duplication here.
  const addBackground = (entry: BackgroundLibraryEntry): void => {
    form.setFieldValue("backgroundLibrary", [...form.state.values.backgroundLibrary, entry]);
    form.setFieldValue("backgroundImageKind", "asset");
    form.setFieldValue("backgroundAssetId", entry.assetId);
    form.setFieldValue("backgroundAssetHash", entry.assetHash);
    form.setFieldValue("backgroundAssetMime", entry.mime);
  };
  // Removing the SELECTED entry also clears the selection in the SAME patch (BG-D — a dangling assetId
  // would paint a background the library no longer names).
  const removeEntry = (entry: BackgroundLibraryEntry): void => {
    const values = form.state.values;
    form.setFieldValue(
      "backgroundLibrary",
      values.backgroundLibrary.filter((row) => row.entryId !== entry.entryId),
    );
    if (values.backgroundImageKind === "asset" && values.backgroundAssetId === entry.assetId) {
      writeNone(form);
    }
  };
  return (
    <Section
      className="@container"
      divider={true}
      heading={APPEARANCE_BACKGROUND_SUBCATEGORY.label}
      id={configAnchorId("appearance", APPEARANCE_BACKGROUND_SUBCATEGORY.id)}
    >
      {/* R-BG (#866 S4): an inherently VISUAL choice picks by THUMBNAIL — one grid: None · the seeded
          plates · every library entry; the selected tile wears the ring; `backgroundImageKind` derives
          from the tap and is never a user-facing control. */}
      <ConfigTeachScope value={{ group: "appearance", sub: APPEARANCE_BACKGROUND_SUBCATEGORY }}>
        <Stack gap="block">
          {/* `span` (#932): a thumbnail grid is a CANVAS, so the row draws the registry lead (name · `i` ·
              gloss) above it instead of pretending to be a two-column knob row with an empty label. */}
          <SettingRowGroup>
            <SettingRow settingId="background-image" span={true}>
              <form.Subscribe selector={(state): BackgroundForm => state.values}>
                {(values): ReactElement => <BackgroundPickGrid form={form} values={values} />}
              </form.Subscribe>
            </SettingRow>
          </SettingRowGroup>

          {/* MANAGE — the library rows (the Your-themes grammar): name · age-free meta · ⋯ Remove. */}
          <form.Subscribe selector={(state): readonly BackgroundLibraryEntry[] => state.values.backgroundLibrary}>
            {(library): ReactElement | null =>
              library.length === 0 ? null : (
                <Stack gap="tight">
                  <Text as="span" voice="kicker">
                    {`Your library · ${library.length}`}
                  </Text>
                  {library.map((entry) => (
                    <ListRow
                      key={entry.entryId}
                      actions={
                        <RowActionsMenu label={`Actions for ${entry.name}`} triggerSize="sm">
                          <MenuItem onClick={(): void => removeEntry(entry)}>
                            <Icon icon={Trash2} size="sm" />
                            Remove from library
                          </MenuItem>
                        </RowActionsMenu>
                      }
                      title={entry.name}
                    />
                  ))}
                </Stack>
              )
            }
          </form.Subscribe>

          {/* ADD — one door at the grid's end; both ways in funnel through the SAME append+select path
              (BG-D), so `/setbackground <name>` and the carried-background picker see every background. */}
          <Collapsible>
            {/* `interactiveKicker`, NOT `kicker` (#1216). This label IS the visible name of a control, and
                `kicker` rides `--text-micro` (10.5px) — design-audit measured it there, under the 11px
                functional floor for interactive copy. The voice beside it exists for exactly this case and
                keeps the tracked instrument register while taking the readable 13px label step, so the door
                stays typographically part of the band it ends without being a footnote you have to lean in
                to read. Not a bare size class: the register is a voice decision, and voices are the closed
                axis a feature may speak. */}
            <CollapsibleTrigger size="control">
              <Text as="span" voice="interactiveKicker">
                Add background
              </Text>
            </CollapsibleTrigger>
            <CollapsiblePanel>
              <Stack gap="field">
                <form.Subscribe selector={(state): string => state.values.backgroundAssetHash}>
                  {(hash): ReactElement => <BackgroundUploadField currentHash={hash} onUploaded={addBackground} />}
                </form.Subscribe>
                <ExternalBackgroundField onAdded={addBackground} />
              </Stack>
            </CollapsiblePanel>
          </Collapsible>

          {/* Fit / Scrim / Blur — correctly primitive'd rows, below the grid, while an image is picked. */}
          <form.Subscribe selector={(state): string => state.values.backgroundImageKind}>
            {(kind): ReactElement | null => {
              if (kind === "none") {
                return null;
              }
              return (
                <SettingRowGroup>
                  <SettingRow settingId="background-fit">
                    <form.AppField name="backgroundFit">
                      {(field): ReactElement => <field.SelectField label="Fit" items={BACKGROUND_FIT_ITEMS} />}
                    </form.AppField>
                  </SettingRow>
                  <SettingRow settingId="background-dim">
                    <form.AppField name="backgroundDim">
                      {(field): ReactElement => (
                        <field.SliderField label="Scrim opacity" min={BACKGROUND_DIM_MIN} max={BACKGROUND_DIM_MAX} step={BACKGROUND_DIM_STEP} />
                      )}
                    </form.AppField>
                  </SettingRow>
                  <SettingRow settingId="background-blur">
                    <form.AppField name="backgroundBlur">
                      {(field): ReactElement => <field.SliderField label="Image blur" min={BACKGROUND_BLUR_MIN} max={BACKGROUND_BLUR_MAX} />}
                    </form.AppField>
                  </SettingRow>
                </SettingRowGroup>
              );
            }}
          </form.Subscribe>
        </Stack>
      </ConfigTeachScope>
      <Row gap="field" align="center">
        <SectionSaveStatus id={sectionId} state={saveState} onRetry={retrySave} />
      </Row>
    </Section>
  );
}

/** The tile the CURRENT form values light — the grid speaks in tiles; the kind is storage detail. */
function selectedTileKey(values: BackgroundForm): string | null {
  if (values.backgroundImageKind === "none") {
    return NONE_TILE_ID;
  }
  if (values.backgroundImageKind === "seeded") {
    return `${SEEDED_PREFIX}${values.backgroundSeededId}`;
  }
  const entryId = values.backgroundLibrary.find((entry) => entry.assetId === values.backgroundAssetId)?.entryId;
  return entryId === undefined ? null : `${ASSET_PREFIX}${entryId}`;
}

/** The ONE tile population over the FORM's own values (a just-added entry appears immediately). */
function BackgroundPickGrid({ form, values }: { readonly form: AutosaveSession<BackgroundForm>["form"]; readonly values: BackgroundForm }): ReactElement {
  const tiles: readonly BackgroundTile[] = [
    { id: NONE_TILE_ID, alt: "No background", apply: writeNone },
    ...listSeededBackgrounds().map(
      (bg): BackgroundTile => ({ id: `${SEEDED_PREFIX}${bg.id}`, alt: bg.label, url: bg.url, apply: (f): void => writeSeeded(f, bg.id) }),
    ),
    ...values.backgroundLibrary.map(
      (entry): BackgroundTile => ({
        id: `${ASSET_PREFIX}${entry.entryId}`,
        alt: entry.name,
        ...(entry.mime.startsWith("video/") ? {} : { thumbUrl: `${blobUrl(entry.assetHash)}?w=${THUMB_WIDTH}` }),
        apply: (f): void => writeAsset(f, entry),
      }),
    ),
  ];
  const selectedKey = selectedTileKey(values);

  return (
    <MediaGrid
      ariaLabel="Background image"
      className="max-h-72 w-full"
      items={tiles}
      minCellWidth={THUMB_WIDTH}
      selection={{
        selectedIds: new Set(selectedKey === null ? [] : [selectedKey]),
        onToggle: (id): void => {
          tiles.find((tile) => tile.id === id)?.apply(form);
        },
      }}
    />
  );
}

// The LOOKS appearance SECTION: ONE COLLECTION, ONE CARD SHAPE. The owner, verbatim: *"i dont want to
// separate our themes from a user's, that's clunky — one spot for themes, they all should have same shape."*
// One concept gets one anatomy. Whether a theme shipped with the app is a PROPERTY of that theme, not a
// different kind of thing.
//
// SO: one grid, every theme, the same cell. `isSeed` changes CAPABILITY only (the ⋯ menu's item list, in
// theme-row-menu.tsx) — never anatomy, never a provenance word, never a separate list. The client keeps NO
// allowlist of shipped names: it renders the server's one readable collection in the order it arrives, so
// a new seed appears with no client change.
//
// APPLY-NOT-MODE: picking a cell APPLIES the look through the D71 pipeline — `theme.selectedThemeId`
// — and THE DEFAULT CARD WRITES NULL (the base `@theme`, no `[data-theme]` block, and the anti-brick reset
// in one gesture). Every other cell writes its id. WHICH card that is comes from the view's derived
// `isDefault`, never from its display name (a renamable word) and never from a client-side sentinel id.
//
// THE CELL IS THE APP'S ONE PICKER CELL inside a real `RadioGroupPicker`: one tab stop, roving focus,
// arrows change selection. The thumbnail is `ThemeMiniSurface`, which paints each row
// from its OWN pipeline (see that file for the seed-vs-custom provenance invariants). The ⋯ is a SIBLING
// of the radio root, never nested inside it — a control inside a control is unreachable by keyboard and
// illegal ARIA.
//
// MAKE — ONE builder door, "New theme from <current>…", with draft/mint machinery (the duplicate is minted at the FIRST REAL EDIT, never on the click), opening the builder INLINE as this
// section's editing state. There is NO freestanding color knob anywhere — a color decision always saves as
// a named theme.
//
// THE SECTION CHROME IS OUTSIDE THE READ, AND THE READ RESERVES ITS BOX. A `<Section>` inside the
// suspending body would paint a pane with no Looks heading and no anchor, then drop the collection in and
// shove everything below down. So the heading + registry-supplied anchor render immediately (a jump target
// that does not exist until a query lands is not a jump target), and the body rides the reservation seam —
// `reserveKey` holds
// the box this device last saw the collection settle at, with the authored skeleton count as the first-boot
// guess. It is the same shape every other anchored config section already used (plugins, automation).
//
// Export is CLIENT-SIDE over the row's own bytes ({name, override, css} JSON — the same values the theme
// renders from). Import is the SERVER's `settings.importThemeFile` door, which reads that export back, an
// orb.theme backup, or a raw SillyTavern theme through the one theme serde — so a non-theme file is refused
// with words instead of landing as a blank theme.

import type { Theme } from "@orb/contracts/theme";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Card } from "@orb/ui/card";
import { FileTrigger } from "@orb/ui/file-trigger";
import { Icon, Plus, Upload } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { RadioGroupPicker, RadioGroupPickerItem } from "@orb/ui/radio-group";
import type { ReactElement } from "react";
import { useId, useState } from "react";
import { ConfigTeachScope, QueryBoundary, SettingRow, SettingRowGroup, Tip, useFirstBootBox } from "#components";
import { QueryErrorState, SkeletonRows, useInvalidation, useSuspenseQuery, useTRPC } from "#data";
import { downloadTextFile, notify } from "#lib";
import { useCreateTheme, useDuplicateTheme, useImportThemeFile, useRemoveTheme, useSelectTheme } from "../hooks/use-theme-mutations.ts";
import { APPEARANCE_LOOKS_SUBCATEGORY } from "../lib/appearance-looks-nav.ts";
import type { ThemeFormValues } from "../lib/theme-editor-model.ts";
import { DEFAULT_THEME_FORM, themeInputFromForm } from "../lib/theme-editor-model.ts";
import { ThemeEditor } from "./theme-editor.tsx";
import { ThemeMiniSurface } from "./theme-mini-surface.tsx";
import { ThemeRowMenu } from "./theme-row-menu.tsx";

const COPY_SUFFIX = " copy";
/** The draft id a from-scratch session carries — it keys the editor's mount, and is never sent anywhere. */
const NEW_THEME_DRAFT_ID = mintTypeId(ID_PREFIX.theme);

/** What the builder pane is showing: an existing row (`mint` absent), or a draft plus the mint that would
 *  bring it into existence (the retired picker's session shape, verbatim). */
interface EditorSession {
  readonly draft: Theme;
  readonly mint?: () => Promise<Theme>;
}

/** A not-yet-existing theme, shaped as the entity the editor seeds from. */
function draftFromValues(id: Theme["id"], values: ThemeFormValues): Theme {
  const input = themeInputFromForm(values);
  return { id, name: input.name, override: input.override, css: input.css ?? null, isSeed: false, isDefault: false, createdAt: 0, updatedAt: 0 };
}

/** The exported file's shape — the row's own bytes, so an export→import round-trip is identity. */
function exportTheme(theme: Theme): void {
  const file = { name: theme.name, override: theme.override, css: theme.css };
  downloadTextFile(`${theme.name}.orbtheme.json`, JSON.stringify(file, null, 2));
}

/** The toast for a landed theme: imported, imported under a numbered name beside a different same-named
 *  theme, or already in the library (equal content, nothing written). */
function importedThemeMessage({
  created,
  name,
  renamedFrom,
}: {
  readonly created: boolean;
  readonly name: string;
  readonly renamedFrom: string | null;
}): string {
  if (!created) {
    return `“${name}” is already in your themes — nothing was added.`;
  }
  if (renamedFrom !== null) {
    return `Imported as “${name}” — you already have a different “${renamedFrom}”.`;
  }
  return `Imported “${name}”.`;
}

/** How many skeleton bars the loading box paints on a device that has never seen this section settle
 *  (the authored count is the first-boot guess). It is measured from the settled `setting-row-group` with
 *  the seed themes at the docked content-pane width, through the `line` arm's `16 + 48N` px pitch. Every later open
 *  reserves what THIS device actually measured. */
const LOOKS_SKELETON_ROWS = 7;

export function AppearanceLooksSection({ anchorId }: { readonly anchorId: string }): ReactElement {
  const firstBootBox = useFirstBootBox({ wide: LOOKS_SKELETON_ROWS, narrow: 14 });
  return (
    <Section divider={true} heading={APPEARANCE_LOOKS_SUBCATEGORY.label} id={anchorId}>
      <QueryBoundary
        fallback={<SkeletonRows count={LOOKS_SKELETON_ROWS} shape="line" />}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="your themes" onRetry={retry} />}
        reserveBlock={firstBootBox}
        reserveKey="config.appearance.looks"
      >
        <LooksBody />
      </QueryBoundary>
    </Section>
  );
}

function LooksBody(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: themes } = useSuspenseQuery(trpc.settings.listThemes.queryOptions());
  const { data: settings } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const selectedId = settings.config.theme.selectedThemeId;

  const selectTheme = useSelectTheme({ trpc, invalidation });
  const createTheme = useCreateTheme({ trpc, invalidation });
  const importTheme = useImportThemeFile({ trpc, invalidation });
  const duplicateTheme = useDuplicateTheme({ trpc, invalidation });
  const removeTheme = useRemoveTheme({ trpc, invalidation });
  const [editing, setEditing] = useState<EditorSession | null>(null);
  const ids = useId();

  // ONE collection, in the SERVER's order — no client allowlist, no shipped/own split. WITH NO EXPLICIT
  // SELECTION the current row is the one the SERVER flags as default: the sentinel id is domain-internal and
  // the display name is a user-visible word that can be renamed, so `isDefault` is the only honest predicate.
  const isActive = (theme: Theme): boolean => (selectedId === null ? theme.isDefault : theme.id === selectedId);
  const current = themes.find(isActive) ?? themes[0];

  // Applying: the ONE applying act. The DEFAULT card writes NULL.
  const applyById = (id: string | null): void => selectTheme.mutate({ section: "theme", patch: { selectedThemeId: id } });
  const apply = (theme: Theme): void => applyById(theme.isDefault ? null : theme.id);

  // The builder door: a DRAFT of the current look; the duplicate row is minted at the first real edit.
  const openBuilderFromCurrent = (): void => {
    if (current === undefined) {
      setEditing({
        draft: draftFromValues(NEW_THEME_DRAFT_ID, DEFAULT_THEME_FORM),
        mint: () => createTheme.mutateAsync(themeInputFromForm(DEFAULT_THEME_FORM)),
      });
      return;
    }
    setEditing({
      draft: { ...current, name: `${current.name}${COPY_SUFFIX}`, isSeed: false, isDefault: false },
      mint: () => duplicateTheme.mutateAsync({ id: current.id }),
    });
  };

  const onImportFile = async (file: File): Promise<void> => {
    try {
      const landed = await importTheme.mutateAsync({ fileText: await file.text(), filename: file.name });
      notify.success(importedThemeMessage(landed));
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Couldn't import the theme.");
    }
  };

  return (
    <>
      {editing !== null ? (
        <Stack gap="block">
          <Row>
            <Button intent="ghost" onClick={(): void => setEditing(null)}>
              ← Back to Looks
            </Button>
          </Row>
          {editing.mint === undefined ? <ThemeEditor theme={editing.draft} /> : <ThemeEditor mint={editing.mint} theme={editing.draft} />}
        </Stack>
      ) : (
        <ConfigTeachScope value={{ group: "appearance", sub: APPEARANCE_LOOKS_SUBCATEGORY }}>
          {/* The two Looks rows are CANVAS rows — one collection, one builder door — so each takes
              `span`, which draws the registry lead (name · `i` · gloss) above the canvas. */}
          <SettingRowGroup>
            <SettingRow settingId="shipped-looks" span={true}>
              <Stack gap="field">
                <Row align="center" className="justify-end" gap="row">
                  <FileTrigger
                    accept="application/json"
                    onFilesSelected={([file]): void => {
                      if (file !== undefined) {
                        onImportFile(file).catch(() => notify.error("Couldn't import the theme."));
                      }
                    }}
                  >
                    {({ open }): ReactElement => (
                      <Tip text="Import a theme file">
                        <Button aria-label="Import a theme file" intent="ghost" onClick={open} size="icon">
                          <Icon icon={Upload} size="sm" />
                        </Button>
                      </Tip>
                    )}
                  </FileTrigger>
                </Row>
                <RadioGroupPicker
                  aria-label="Theme"
                  data-slot="theme-collection"
                  onValueChange={(next): void => {
                    const picked = themes.find((theme) => theme.id === next);
                    if (picked !== undefined) {
                      apply(picked);
                    }
                  }}
                  value={current?.id ?? null}
                >
                  {themes.map((theme) => (
                    // The ⋯ is a SIBLING of the radio root (never nested interaction), positioned over the
                    // cell's own top-leading corner \u2014 the check indicator owns the trailing one.
                    <Row className="relative min-inline-0" key={theme.id}>
                      <RadioGroupPickerItem
                        art={<ThemeMiniSurface theme={theme} />}
                        className="inline-full"
                        idPrefix={`${ids}-${theme.id}`}
                        label={theme.name}
                        {...(isActive(theme) ? { meta: "current" } : {})}
                        value={theme.id}
                      />
                      <Card className="absolute inset-s-tight inset-bs-tight flex" padding="none" shape="row" tone="translucent">
                        <ThemeRowMenu
                          onApply={(): void => apply(theme)}
                          onDelete={(): void => removeTheme.mutate({ id: theme.id })}
                          onDuplicate={(): void => {
                            duplicateTheme.mutate({ id: theme.id });
                          }}
                          onEdit={(): void => setEditing({ draft: theme })}
                          onExport={(): void => exportTheme(theme)}
                          theme={theme}
                        />
                      </Card>
                    </Row>
                  ))}
                </RadioGroupPicker>
              </Stack>
            </SettingRow>

            <SettingRow settingId="theme-builder" span={true}>
              <Row align="center" gap="row">
                <Button intent="secondary" onClick={openBuilderFromCurrent}>
                  <Icon icon={Plus} size="sm" />
                  {/* The door names the row the collection says is CURRENT. An EMPTY collection has no
                      such row and no name to borrow — that arm opens the from-scratch draft above, so it
                      says so rather than naming a palette that is not on screen. */}
                  {current === undefined ? "New theme…" : `New theme from ${current.name}…`}
                </Button>
              </Row>
            </SettingRow>
          </SettingRowGroup>
        </ConfigTeachScope>
      )}
    </>
  );
}

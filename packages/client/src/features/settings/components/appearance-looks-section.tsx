// The LOOKS appearance SECTION (#866 S4 / #297 — config-revamp-design.md §7.3, as amended by the owner's
// 2026-08-30 ruling): ONE COLLECTION, ONE CARD SHAPE. Verbatim: *"i dont want to separate our themes from
// a user's, that's clunky — one spot for themes, they all should have same shape."* That supersedes §7.3's
// three tiers — the shipped looks as fixed CARDS over "Your themes" as `ListRow`s — which rendered one
// concept in two anatomies and made a user learn two layouts to do one job. Whether a theme shipped with
// the app is a PROPERTY of that theme, not a different kind of thing.
//
// SO: one grid, every theme, the same cell. `isSeed` changes CAPABILITY only (the ⋯ menu's item list, in
// theme-row-menu.tsx) — never anatomy, never a provenance word, never a separate list. The client keeps NO
// allowlist of shipped names: it renders the server's one readable collection in the order it arrives, so
// a fourth seed appears with no client change (the deleted `SHIPPED_ORDER`/`shipped`/`own` split is what
// made that impossible).
//
// APPLY-NOT-MODE (#297): picking a cell APPLIES the look through the D71 pipeline — `theme.selectedThemeId`
// — and HEARTH WRITES NULL (the base `@theme`, no `[data-theme]` block, and the anti-brick reset in one
// gesture). Every other cell writes its id.
//
// THE CELL IS THE APP'S ONE PICKER CELL (#929 E6) inside a real `RadioGroupPicker`: one tab stop, roving
// focus, arrows change selection (#981 F20). The thumbnail is `ThemeMiniSurface`, which paints each row
// from its OWN pipeline (see that file for the seed-vs-custom provenance invariants). The ⋯ is a SIBLING
// of the radio root, never nested inside it — a control inside a control is unreachable by keyboard and
// illegal ARIA.
//
// MAKE — ONE builder door, "New theme from <current>…": the retired picker's draft/mint machinery verbatim
// (the duplicate is minted at the FIRST REAL EDIT, never on the click), opening the builder INLINE as this
// section's editing state. There is NO freestanding color knob anywhere — a color decision always saves as
// a named theme.
//
// Export/Import are CLIENT-SIDE over the row's own bytes ({name, override, css} JSON — the same values the
// theme renders from).

import type { CreateThemeInput, Theme } from "@orb/contracts/theme";
import type { ThemeId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { FileTrigger } from "@orb/ui/file-trigger";
import { Icon, Plus, Upload } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { RadioGroupPicker, RadioGroupPickerItem } from "@orb/ui/radio-group";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useId, useState } from "react";
import { ConfigTeachScope, SettingRow, SettingRowGroup } from "#components";
import { QueryBoundary, QueryErrorState, useInvalidation, useTRPC } from "#data";
import { downloadTextFile, notify } from "#lib";
import { configAnchorId } from "#state";
import { useCreateTheme, useDuplicateTheme, useRemoveTheme, useSelectTheme } from "../hooks/use-theme-mutations.ts";
import { APPEARANCE_LOOKS_SUBCATEGORY } from "../lib/appearance-looks-nav.ts";
import type { ThemeFormValues } from "../lib/theme-editor-model.ts";
import { DEFAULT_THEME_FORM, themeInputFromForm } from "../lib/theme-editor-model.ts";
import { ThemeEditor } from "./theme-editor.tsx";
import { ThemeMiniSurface } from "./theme-mini-surface.tsx";
import { ThemeRowMenu } from "./theme-row-menu.tsx";

/** The ONE seed whose selection is spelled `null` — it IS the base `@theme`, so it has no
 *  `[data-theme]` block to select into. Every other theme (seed or owned) writes its own id. */
const HEARTH_NAME = "Hearth";
const COPY_SUFFIX = " copy";
/** The draft id a from-scratch session carries — it keys the editor's mount, and is never sent anywhere. */
const NEW_THEME_DRAFT_ID = "theme_draft_new";

/** What the builder pane is showing: an existing row (`mint` absent), or a draft plus the mint that would
 *  bring it into existence (the retired picker's session shape, verbatim). */
interface EditorSession {
  readonly draft: Theme;
  readonly mint?: () => Promise<Theme>;
}

/** A not-yet-existing theme, shaped as the entity the editor seeds from. */
function draftFromValues(id: string, values: ThemeFormValues): Theme {
  const input = themeInputFromForm(values);
  return { id, name: input.name, override: input.override, css: input.css ?? null, isSeed: false, createdAt: 0, updatedAt: 0 };
}

/** The exported file's shape — the row's own bytes, so an export→import round-trip is identity. */
function exportTheme(theme: Theme): void {
  const file = { name: theme.name, override: theme.override, css: theme.css };
  downloadTextFile(`${theme.name}.orbtheme.json`, JSON.stringify(file, null, 2));
}

/** Parse an imported theme file into a create input — the SERVER's schema is the real validator; this
 *  only shapes the bytes and refuses non-objects with words. */
function parseThemeFile(text: string): CreateThemeInput {
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("That file isn't a theme export.");
  }
  const bag = parsed as { name?: unknown; override?: unknown; css?: unknown };
  return {
    name: typeof bag.name === "string" && bag.name.trim().length > 0 ? bag.name : "Imported theme",
    override: (bag.override ?? {}) as CreateThemeInput["override"],
    ...(typeof bag.css === "string" ? { css: bag.css } : {}),
  };
}

export function AppearanceLooksSection(): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text voice="gloss">Loading your themes…</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="your themes" onRetry={retry} />}
    >
      <LooksBody />
    </QueryBoundary>
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
  const duplicateTheme = useDuplicateTheme({ trpc, invalidation });
  const removeTheme = useRemoveTheme({ trpc, invalidation });
  const [editing, setEditing] = useState<EditorSession | null>(null);
  const ids = useId();

  // ONE collection, in the SERVER's order — no client allowlist, no shipped/own split (#920).
  const isActive = (theme: Theme): boolean => (selectedId === null ? theme.isSeed && theme.name === HEARTH_NAME : theme.id === selectedId);
  const current = themes.find(isActive) ?? themes[0];

  // Applying: the ONE applying act (#297). The Hearth card writes NULL.
  const applyById = (id: string | null): void => selectTheme.mutate({ section: "theme", patch: { selectedThemeId: id } });
  const apply = (theme: Theme): void => applyById(theme.isSeed && theme.name === HEARTH_NAME ? null : theme.id);

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
      draft: { ...current, name: `${current.name}${COPY_SUFFIX}`, isSeed: false },
      mint: () => duplicateTheme.mutateAsync({ id: current.id as ThemeId }),
    });
  };

  const onImportFile = async (file: File): Promise<void> => {
    try {
      const created = await createTheme.mutateAsync(parseThemeFile(await file.text()));
      notify.success(`Imported “${created.name}”.`);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : "Couldn't import the theme.");
    }
  };

  return (
    <Section divider={true} heading={APPEARANCE_LOOKS_SUBCATEGORY.label} id={configAnchorId("appearance", APPEARANCE_LOOKS_SUBCATEGORY.id)}>
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
          {/* #932: the two Looks rows are CANVAS rows — one collection, one builder door — so each takes
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
                      <Button aria-label="Import a theme file" intent="ghost" onClick={open} size="icon" title="Import a theme file">
                        <Icon icon={Upload} size="sm" />
                      </Button>
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
                    <Row className="relative min-w-0" key={theme.id}>
                      <RadioGroupPickerItem
                        art={<ThemeMiniSurface theme={theme} />}
                        className="w-full"
                        idPrefix={`${ids}-${theme.id}`}
                        label={theme.name}
                        {...(isActive(theme) ? { meta: "current" } : {})}
                        value={theme.id}
                      />
                      <Row className="absolute top-tight left-tight rounded-control bg-card/80">
                        <ThemeRowMenu
                          onApply={(): void => apply(theme)}
                          onDelete={(): void => removeTheme.mutate({ id: theme.id as ThemeId })}
                          onDuplicate={(): void => {
                            duplicateTheme.mutate({ id: theme.id as ThemeId });
                          }}
                          onEdit={(): void => setEditing({ draft: theme })}
                          onExport={(): void => exportTheme(theme)}
                          theme={theme}
                        />
                      </Row>
                    </Row>
                  ))}
                </RadioGroupPicker>
              </Stack>
            </SettingRow>

            <SettingRow settingId="theme-builder" span={true}>
              <Row align="center" gap="row">
                <Button intent="secondary" onClick={openBuilderFromCurrent}>
                  <Icon icon={Plus} size="sm" />
                  {`New theme from ${current?.name ?? HEARTH_NAME}…`}
                </Button>
              </Row>
            </SettingRow>
          </SettingRowGroup>
        </ConfigTeachScope>
      )}
    </Section>
  );
}

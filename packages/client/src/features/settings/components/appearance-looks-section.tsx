// The LOOKS appearance SECTION (#866 S4 / #297 — config-revamp-design.md §7.3, the owner-approved
// canvas): APPLY-NOT-MODE in three tiers. PICK — the three shipped looks as fixed cards (a closed set;
// picking APPLIES via the D71 pipeline: `theme.selectedThemeId`, and the Hearth card writes NULL — the
// base `@theme`, no `[data-theme]` block). MANAGE — "Your themes": imported + built themes as rows
// (swatch strip · name · age · ⋯ = Apply · Edit in builder · Export · Delete) plus the Import file door.
// MAKE — ONE builder door, "New theme from <current>…": the retired picker's draft/mint machinery
// verbatim (the duplicate is minted at the FIRST REAL EDIT, never on the click), opening the builder
// INLINE as this section's editing state. There is NO freestanding color knob anywhere — a color
// decision always saves as a named theme.
//
// Export/Import are CLIENT-SIDE over the row's own bytes ({name, override, css} JSON — the same values
// the theme renders from); no provenance word on rows (owner ruling 2026-08-30 — name · swatch · age · ⋯).

import type { CreateThemeInput, Theme } from "@orb/contracts/theme";
import type { ThemeId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { FileTrigger } from "@orb/ui/file-trigger";
import { Icon, Plus, Upload } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import { ThemeSwatchCard, ThemeSwatchStrip } from "@orb/ui/theme-swatch";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { ConfigTeachScope, SettingRow } from "#components";
import { QueryBoundary, QueryErrorState, useInvalidation, useTRPC } from "#data";
import { downloadTextFile, notify, timeLib } from "#lib";
import { configAnchorId } from "#state";
import { useCreateTheme, useDuplicateTheme, useRemoveTheme, useSelectTheme } from "../hooks/use-theme-mutations.ts";
import { APPEARANCE_LOOKS_SUBCATEGORY } from "../lib/appearance-looks-nav.ts";
import type { ThemeFormValues } from "../lib/theme-editor-model.ts";
import { DEFAULT_THEME_FORM, themeInputFromForm } from "../lib/theme-editor-model.ts";
import { ThemeEditor } from "./theme-editor.tsx";
import { ThemeRowMenu } from "./theme-row-menu.tsx";

const HEARTH_NAME = "Hearth";
/** The shipped set, in the canvas's order — a CLOSED row (this list never grows; new looks are YOURS). */
const SHIPPED_ORDER = [HEARTH_NAME, "Mocha", "Light"] as const;
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

  const shipped = SHIPPED_ORDER.flatMap((name) => {
    const seed = themes.find((theme) => theme.isSeed && theme.name === name);
    return seed === undefined ? [] : [seed];
  });
  const own = themes.filter((theme) => !theme.isSeed);
  const isActive = (theme: Theme): boolean => (selectedId === null ? theme.isSeed && theme.name === HEARTH_NAME : theme.id === selectedId);
  const current = themes.find(isActive) ?? shipped[0];

  // Applying: the ONE applying act (#297). The Hearth card writes NULL — the base theme, no data-theme
  // block, and the anti-brick reset semantics in one gesture.
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
          <Stack gap="block">
            <SettingRow settingId="shipped-looks">
              <Stack gap="field">
                <Text as="span" voice="gloss">
                  Shipped · picking applies it
                </Text>
                <Row gap="row" className="flex-wrap">
                  {shipped.map((theme) => (
                    <ThemeSwatchCard
                      key={theme.id}
                      name={theme.name}
                      {...(isActive(theme) ? { meta: "current" } : {})}
                      onSelect={(): void => apply(theme)}
                      selected={isActive(theme)}
                      tokens={theme.override}
                    />
                  ))}
                </Row>
              </Stack>
            </SettingRow>

            <SettingRow settingId="your-themes">
              <Stack gap="field">
                <Row align="center" gap="row" className="justify-between">
                  <Text as="span" voice="kicker">
                    {own.length === 0 ? "Your themes" : `Your themes · ${own.length}`}
                  </Text>
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
                {own.length === 0 ? (
                  <Text voice="gloss">Nothing here yet — import a theme file, or start one in the builder below.</Text>
                ) : (
                  <Stack gap="tight">
                    {own.map((theme) => (
                      <ListRow
                        key={theme.id}
                        actions={
                          <ThemeRowMenu
                            onApply={(): void => applyById(theme.id)}
                            onDelete={(): void => removeTheme.mutate({ id: theme.id as ThemeId })}
                            onEdit={(): void => setEditing({ draft: theme })}
                            onExport={(): void => exportTheme(theme)}
                            theme={theme}
                          />
                        }
                        clickable={true}
                        leading={<ThemeSwatchStrip tokens={theme.override} />}
                        onClick={(): void => applyById(theme.id)}
                        selected={isActive(theme)}
                        subtitle={timeLib.formatRelative(theme.updatedAt)}
                        title={theme.name}
                      />
                    ))}
                  </Stack>
                )}
              </Stack>
            </SettingRow>

            <SettingRow settingId="theme-builder">
              <Row align="center" gap="row" className="justify-between">
                <Text as="span" voice="label">
                  Theme builder
                </Text>
                <Button intent="secondary" onClick={openBuilderFromCurrent}>
                  <Icon icon={Plus} size="sm" />
                  {`New theme from ${current?.name ?? HEARTH_NAME}…`}
                </Button>
              </Row>
            </SettingRow>
          </Stack>
        </ConfigTeachScope>
      )}
    </Section>
  );
}

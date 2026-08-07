// theme-picker-surface — the theme library + picker. Lists owned ∪ seed themes, shows the active one
// (null = the Hearth default), and drives the full lifecycle: select, new, customize/duplicate,
// edit/delete owned rows, and reset-to-Hearth. Selecting is the only thing that applies globally; editing
// a theme is scoped to the editor's own preview until saved.
//
// "New" and "Customize" open the editor on a DRAFT: this surface hands the editor the values to start from
// plus the mint that would create the row, and the editor calls that mint at the FIRST REAL EDIT — never on
// the click. Opening a customize and going straight back therefore leaves nothing behind (it used to leave
// a copy the owner never asked for and had to find and delete). The seed-to-draft shaping lives here
// because this is where "what a copy of this row starts as" is known; the interception lives in the editor
// because that is where an edit is observed.

import type { Theme } from "@orb/contracts/theme";
import type { ThemeId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Check, Icon, Plus } from "@orb/ui/icons";
import { Container, Row, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Text } from "@orb/ui/text";
import { ThemeScope } from "@orb/ui/theme-scope";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useRef, useState } from "react";
import { QueryBoundary, QueryErrorState, useInvalidation, useTRPC } from "#data";
import { useFocusOnMount } from "#lib";
import { ThemeEditor } from "../components/theme-editor.tsx";
import { ThemeRowMenu } from "../components/theme-row-menu.tsx";
import { useCreateTheme, useDuplicateTheme, useRemoveTheme, useSelectTheme } from "../hooks/use-theme-mutations.ts";
import type { ThemeFormValues } from "../lib/theme-editor-model.ts";
import { DEFAULT_THEME_FORM, themeInputFromForm } from "../lib/theme-editor-model.ts";

const HEARTH_NAME = "Hearth";
const COPY_SUFFIX = " copy";
/** The draft id a from-scratch session carries — it keys the editor's mount, and is never sent anywhere. */
const NEW_THEME_DRAFT_ID = "theme_draft_new";

/** What the editor pane is showing: an existing row (`mint` absent), or a draft plus the mint that would
 *  bring it into existence. */
interface EditorSession {
  readonly draft: Theme;
  readonly mint?: () => Promise<Theme>;
}

/** A not-yet-existing theme, shaped as the entity the editor seeds from. `createdAt`/`updatedAt` are 0 —
 *  the editor reads neither, and a fake timestamp would be a lie the moment the real row lands. */
function draftFromValues(id: string, values: ThemeFormValues): Theme {
  const input = themeInputFromForm(values);
  return { id, name: input.name, override: input.override, css: input.css ?? null, isSeed: false, createdAt: 0, updatedAt: 0 };
}

/** The theme picker/library body (rendered inside the `theme` modal's Dialog). */
export function ThemePickerSurface(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  return (
    <Container ref={surfaceRef} tabIndex={-1} className="outline-none">
      <QueryBoundary
        fallback={<Text voice="gloss">Loading your themes…</Text>}
        renderError={(_error, retry): ReactElement => <QueryErrorState label="your themes" onRetry={retry} />}
      >
        <ThemeManager />
      </QueryBoundary>
    </Container>
  );
}

function ThemeManager(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: themes } = useSuspenseQuery(trpc.settings.listThemes.queryOptions());
  const { data: settings } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const selectedId = settings.config.theme.selectedThemeId;

  const selectTheme = useSelectTheme({ trpc, invalidation });
  const createTheme = useCreateTheme({ trpc, invalidation });
  const duplicateTheme = useDuplicateTheme({ trpc, invalidation });
  const removeTheme = useRemoveTheme({ trpc, invalidation });

  // Held by value (not id): an existing row opens instantly, and a DRAFT has no id to hold in the first
  // place until its mint runs.
  const [editing, setEditing] = useState<EditorSession | null>(null);

  const onNew = (): void => {
    setEditing({ draft: draftFromValues(NEW_THEME_DRAFT_ID, DEFAULT_THEME_FORM), mint: () => createTheme.mutateAsync(themeInputFromForm(DEFAULT_THEME_FORM)) });
  };
  // The draft a copy starts as: the source's own values under the name the duplicate verb would derive.
  // The verb still owns the REAL name (it de-collides at the mint) — this is only what the editor shows
  // before anything exists, and the editor reconciles it once the row lands.
  const onCustomize = (source: Theme): void => {
    setEditing({
      draft: { ...source, name: `${source.name}${COPY_SUFFIX}`, isSeed: false },
      mint: () => duplicateTheme.mutateAsync({ id: source.id as ThemeId }),
    });
  };
  const selectById = (id: string | null): void => selectTheme.mutate({ section: "theme", patch: { selectedThemeId: id } });

  if (editing !== null) {
    return (
      <Stack gap="block">
        <Row>
          <Button intent="ghost" onClick={(): void => setEditing(null)}>
            ← Back to themes
          </Button>
        </Row>
        {editing.mint === undefined ? <ThemeEditor theme={editing.draft} /> : <ThemeEditor mint={editing.mint} theme={editing.draft} />}
      </Stack>
    );
  }

  const isActive = (theme: Theme): boolean => (selectedId === null ? theme.isSeed && theme.name === HEARTH_NAME : theme.id === selectedId);

  return (
    <Stack gap="block">
      {/* MOBILE-THEME-SELECTOR — the band REFLOWS instead of assuming a minimum width. Measured at a 320px
          viewport (`pnpm snap / --viewport 320x800`): this one row is `label + "Reset to Hearth" + "New
          theme"`, which cannot fit, and with no wrap the primary was sheared to a ~10px orange sliver against
          the dialog edge — the reported "clipped and shrunken" picker. It is NOT the dialog's `size="md"`
          max-width (the list rows below it fit fine at the same width), so widening the dialog would have
          moved the symptom without fixing the rigidity. `gap-row` keeps the two lines from touching once they
          split; `min-w-0` lets the label shrink before anything is clipped. */}
      <Row align="center" gap="row" className="flex-wrap justify-between">
        <Text voice="label" className="min-w-0">
          Themes
        </Text>
        <Row gap="row">
          <Button intent="ghost" onClick={(): void => selectById(null)}>
            Reset to Hearth
          </Button>
          <Button intent="primary" onClick={onNew}>
            <Icon icon={Plus} size="sm" />
            New theme
          </Button>
        </Row>
      </Row>
      <Stack gap="row">
        {themes.map((theme) => (
          <ListRow
            key={theme.id}
            leading={<ThemeSwatch theme={theme} />}
            title={theme.name}
            subtitle={theme.isSeed ? "Built-in" : "Your theme"}
            clickable={true}
            selected={isActive(theme)}
            onClick={(): void => selectById(theme.id)}
            actions={
              <Row gap="field" align="center">
                {isActive(theme) ? <Icon icon={Check} label="Active theme" size="sm" /> : null}
                <ThemeRowMenu
                  theme={theme}
                  onCustomize={(): void => onCustomize(theme)}
                  onEdit={(): void => setEditing({ draft: theme })}
                  onDelete={(): void => removeTheme.mutate({ id: theme.id as ThemeId })}
                />
              </Row>
            }
          />
        ))}
      </Stack>
    </Stack>
  );
}

/** A theme's swatch — its real background + accent, painted through `<ThemeScope>` (never a raw inline style). Decorative, no accessible-name leak. */
function ThemeSwatch({ theme }: { readonly theme: Theme }): ReactElement {
  return (
    <ThemeScope className="flex size-8 items-end justify-end rounded-control border border-border bg-background p-field" tokens={theme.override}>
      <Stack className="size-2 rounded-full bg-primary">{null}</Stack>
    </ThemeScope>
  );
}

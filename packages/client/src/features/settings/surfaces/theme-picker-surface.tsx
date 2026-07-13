// theme-picker-surface — the theme library + picker. Lists owned ∪ seed themes, shows the active one
// (null = the Hearth default), and drives the full lifecycle: select, new (create → open editor),
// customize a seed (duplicate → open editor), edit/delete owned rows, and reset-to-Hearth. Selecting is
// the only thing that applies globally; editing a theme is scoped to the editor's own preview until saved.

import type { Theme } from "@orb/contracts/theme";
import type { ThemeId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind @orb/ui/icons; tsc + vite resolve every glyph fine (the character-library-surface.tsx precedent).
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
import { ThemeEditor } from "../components/theme-editor";
import { ThemeRowMenu } from "../components/theme-row-menu";
import {
  useCreateTheme,
  useDuplicateTheme,
  useRemoveTheme,
  useSelectTheme,
} from "../hooks/use-theme-mutations";
import { DEFAULT_THEME_FORM, themeInputFromForm } from "../lib/theme-editor-model";

const HEARTH_NAME = "Hearth";

/** The theme picker/library body (rendered inside the `theme` modal's Dialog). */
export function ThemePickerSurface(): ReactElement {
  const surfaceRef = useRef<HTMLDivElement>(null);
  useFocusOnMount(surfaceRef);

  return (
    <Container ref={surfaceRef} tabIndex={-1} className="outline-none">
      <QueryBoundary
        fallback={<Text tone="muted">Loading your themes…</Text>}
        renderError={(_error, retry): ReactElement => (
          <QueryErrorState label="your themes" onRetry={retry} />
        )}
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

  // Held by value (not id) so a fresh create/duplicate opens instantly without waiting for the listThemes refetch.
  const [editing, setEditing] = useState<Theme | null>(null);

  const onNew = async (): Promise<void> => {
    try {
      const created = await createTheme.mutateAsync(themeInputFromForm(DEFAULT_THEME_FORM));
      setEditing(created);
    } catch {
      // errorToast already surfaced the failure — stay on the list.
    }
  };
  const onCustomize = async (seedId: ThemeId): Promise<void> => {
    try {
      const duplicated = await duplicateTheme.mutateAsync({ id: seedId });
      setEditing(duplicated);
    } catch {
      // errorToast already surfaced the failure — stay on the list.
    }
  };
  const selectById = (id: string | null): void =>
    selectTheme.mutate({ section: "theme", patch: { selectedThemeId: id } });

  if (editing !== null) {
    return (
      <Stack gap="block">
        <Row>
          <Button intent="ghost" onClick={(): void => setEditing(null)}>
            ← Back to themes
          </Button>
        </Row>
        <ThemeEditor theme={editing} />
      </Stack>
    );
  }

  const isActive = (theme: Theme): boolean =>
    selectedId === null ? theme.isSeed && theme.name === HEARTH_NAME : theme.id === selectedId;

  return (
    <Stack gap="block">
      <Row align="center" className="justify-between">
        <Text size="label" weight="medium">
          Themes
        </Text>
        <Row gap="row">
          <Button intent="ghost" onClick={(): void => selectById(null)}>
            Reset to Hearth
          </Button>
          <Button intent="primary" onClick={(): void => void onNew()}>
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
                  onCustomize={(): void => void onCustomize(theme.id as ThemeId)}
                  onEdit={(): void => setEditing(theme)}
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
    <ThemeScope
      className="flex size-8 items-end justify-end rounded-control border border-border bg-background p-field"
      tokens={theme.override}
    >
      <Stack className="size-2 rounded-full bg-primary">{null}</Stack>
    </ThemeScope>
  );
}

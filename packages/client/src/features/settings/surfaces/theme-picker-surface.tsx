// theme-picker-surface — the REAL theme library + picker (D44 §12.1 · themes-design §4). Replaces the
// interim read-only picker now that persistence is built. Lists owned ∪ seed themes (`listThemes`), shows
// the active one (`theme.selectedThemeId`; `null` = the Hearth default), and drives the full lifecycle:
// SELECT (writes selectedThemeId — the Layer-1 live flip), NEW (create → open editor), CUSTOMIZE a seed
// (duplicate → open editor), EDIT/DELETE owned rows, and RESET-to-Hearth (Tier-3 anti-brick). The route
// composes it over the `theme` modal slot. Selecting is the ONLY thing that applies globally; editing a
// theme is scoped to the editor's own preview until saved (Tier-3).

import type { Theme } from "@orb/contracts/theme";
import type { ThemeId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
// biome-ignore lint/correctness/noUnresolvedImports: biome's resolver stops at the lucide-react re-export chain behind @orb/ui/icons; tsc + vite resolve every glyph fine (the character-library-surface.tsx precedent).
import { Check, Copy, Icon, Pencil, Plus, Trash2 } from "@orb/ui/icons";
import { Container, Row, Stack } from "@orb/ui/layout";
import { ListRow } from "@orb/ui/list-row";
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from "@orb/ui/menu";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { CSSProperties, ReactElement } from "react";
import { useState } from "react";
import { QueryBoundary, useInvalidation, useTRPC } from "#data";
import { ThemeEditor } from "../components/theme-editor";
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
  return (
    <Container>
      <QueryBoundary
        fallback={<Text tone="muted">Loading your themes…</Text>}
        renderError={(_error, retry): ReactElement => (
          <Text tone="muted">
            Couldn't load your themes.{" "}
            <Button intent="ghost" onClick={retry}>
              Retry
            </Button>
          </Text>
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

  // The in-edit theme is held by VALUE (not id) so a fresh create/duplicate opens instantly without
  // waiting for the listThemes refetch.
  const [editing, setEditing] = useState<Theme | null>(null);

  const onNew = async (): Promise<void> => {
    const created = await createTheme.mutateAsync(themeInputFromForm(DEFAULT_THEME_FORM));
    setEditing(created);
  };
  const onCustomize = async (seedId: ThemeId): Promise<void> => {
    const duplicated = await duplicateTheme.mutateAsync({ id: seedId });
    setEditing(duplicated);
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

/** A theme's swatch — its real background + accent (from the stored override). */
function ThemeSwatch({ theme }: { readonly theme: Theme }): ReactElement {
  const style: CSSProperties = {
    background: theme.override.background ?? "var(--color-background)",
  };
  const dot: CSSProperties = { background: theme.override.accent ?? "var(--color-primary)" };
  return (
    <Row
      aria-hidden={true}
      className="size-8 items-end justify-end rounded-control border border-border p-field"
      style={style}
    >
      <Stack className="size-2 rounded-full" style={dot} />
    </Row>
  );
}

/** The per-row action menu: seeds offer only Customize (duplicate-to-edit); owned rows offer Edit ·
 *  Duplicate · Delete. */
function ThemeRowMenu({
  theme,
  onCustomize,
  onEdit,
  onDelete,
}: {
  readonly theme: Theme;
  readonly onCustomize: () => void;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}): ReactElement {
  return (
    <Menu>
      <MenuTrigger
        render={<Button intent="ghost" size="sm" aria-label={`${theme.name} actions`} />}
      >
        ⋯
      </MenuTrigger>
      <MenuPopup align="end">
        {theme.isSeed ? (
          <MenuItem onClick={onCustomize}>
            <Icon icon={Copy} size="sm" />
            Customize
          </MenuItem>
        ) : (
          <>
            <MenuItem onClick={onEdit}>
              <Icon icon={Pencil} size="sm" />
              Edit
            </MenuItem>
            <MenuItem onClick={onCustomize}>
              <Icon icon={Copy} size="sm" />
              Duplicate
            </MenuItem>
            <MenuSeparator />
            <MenuItem onClick={onDelete}>
              <Icon icon={Trash2} size="sm" />
              Delete
            </MenuItem>
          </>
        )}
      </MenuPopup>
    </Menu>
  );
}

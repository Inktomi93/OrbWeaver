// The APPEARANCE settings surface (D44 §12.1 — the NON-color display surface; UI-Arch §13.4 form-
// factory panel). Renders inside the shell's settings modal (mounted by the ROUTE into
// `AppShellProps.modals`, never imported by app-shell — the domain-agnostic shell renders a ReactNode
// slot). Reads the synced `UserSettings.appearance` blob via `getUserSettings` (QueryBoundary +
// useSuspenseQuery — the message-list-surface canonical), and autosaves each change back through
// `updateUserSettingsSection("appearance")`. That mutation's `invalidates` refetches `getUserSettings`,
// so the OTHER consumers (chat's `useChatStyle`/`useMessageAppearance`, the shell's density stamp)
// re-render live — flipping chatStyle here flips the message rendering with no reload (the §12.1 payoff).
//
// V1 SCOPE (NO DEAD TOGGLES): only the knobs wired end-to-end get a field — chatStyle, avatarSize,
// avatarShape, showInChatAvatars, density. The schema is COMPLETE (all 15 knobs persist); the deferred
// knobs' fields land WITH their render consumers (a persisted-but-inert toggle would be a soft shim).
// The form's value type is the FULL `AppearanceSettings`, so the unshown knobs round-trip their server
// values unchanged on every patch.

import type { AppearanceSettings } from "@orb/contracts/settings";
import { THEME_CHAT_STYLES, THEME_DENSITIES } from "@orb/contracts/theme";
import { Section, Stack } from "@orb/ui/layout";
import type { SelectItems } from "@orb/ui/select";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { createEntityMutation, QueryBoundary, useInvalidation, useTRPC } from "#data";
import { APPEARANCE_ENTITY_ID, useAppearanceForm } from "../hooks/use-appearance-form";

// ── Labelled Select options — each `value` pinned to the AppearanceSettings field union (`satisfies`),
// so a typo'd value is a tsc error, not a silently-unselectable option. chatStyle/density values come
// from the #theme canonical tuples (one home); avatarSize/avatarShape are the schema's inline enums.
const CHAT_STYLE_LABELS: Record<AppearanceSettings["chatStyle"], string> = {
  bubble: "Bubble",
  flat: "Flat",
  document: "Document",
};
const CHAT_STYLE_ITEMS: SelectItems<string> = THEME_CHAT_STYLES.map((value) => ({
  value,
  label: CHAT_STYLE_LABELS[value],
}));

const DENSITY_LABELS: Record<AppearanceSettings["density"], string> = {
  comfortable: "Comfortable",
  compact: "Compact",
};
const DENSITY_ITEMS: SelectItems<string> = THEME_DENSITIES.map((value) => ({
  value,
  label: DENSITY_LABELS[value],
}));

const AVATAR_SIZE_ITEMS: SelectItems<string> = [
  { value: "sm", label: "Small" },
  { value: "md", label: "Medium" },
  { value: "lg", label: "Large" },
] satisfies readonly { value: AppearanceSettings["avatarSize"]; label: string }[];

const AVATAR_SHAPE_ITEMS: SelectItems<string> = [
  { value: "round", label: "Round" },
  { value: "square", label: "Square" },
] satisfies readonly { value: AppearanceSettings["avatarShape"]; label: string }[];

// The section-patch mutation (module scope, §13.1). `invalidates` refetches getUserSettings through the
// central seam — the live-flip mechanism for every other appearance consumer. TVars.patch is the typed
// section; the router input is a generic `Record<string, unknown>`, hence the one boundary cast below.
interface UpdateAppearanceVars {
  readonly section: "appearance";
  readonly patch: Record<string, unknown>;
}
const useUpdateAppearance = createEntityMutation<UpdateAppearanceVars, unknown>({
  options: (trpc) => trpc.settings.updateUserSettingsSection.mutationOptions(),
  invalidates: (trpc) => [trpc.settings.getUserSettings.queryFilter()],
  errorToast: "Couldn't save your appearance settings.",
});

/** The appearance panel body (rendered inside the settings modal's Dialog). */
export function AppearanceSettingsSurface(): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text tone="muted">Loading your appearance settings…</Text>}
      renderError={(_error, retry): ReactElement => (
        <Text tone="muted">
          Couldn't load your appearance settings.{" "}
          <button type="button" onClick={retry}>
            Retry
          </button>
        </Text>
      )}
    >
      <AppearanceForm />
    </QueryBoundary>
  );
}

/** Suspends on the synced settings read, then binds the autosave form to `appearance`. */
function AppearanceForm(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const update = useUpdateAppearance({ trpc, invalidation });

  const save = (values: AppearanceSettings): Promise<unknown> =>
    // The patch is the full appearance section (unshown knobs round-trip unchanged). AppearanceSettings
    // has no index signature, so the widening to the router's `Record<string, unknown>` input is an
    // explicit boundary cast (the values are all JSON scalars/enums — safe by construction).
    update.mutateAsync({ section: "appearance", patch: values as Record<string, unknown> });

  const { form, mountKey } = useAppearanceForm({
    entityId: APPEARANCE_ENTITY_ID,
    serverValues: data.config.appearance,
    save,
  });

  return (
    <Stack key={mountKey} gap="section">
      <Text size="label" tone="muted">
        Changes save automatically and sync across your devices.
      </Text>

      <Section heading="Message style">
        <form.AppField name="chatStyle">
          {(field): ReactElement => (
            <field.SelectField
              label="Chat display"
              description="Bubble tints each message; flat is full-width; document is a centered manuscript column."
              items={CHAT_STYLE_ITEMS}
            />
          )}
        </form.AppField>
        <form.AppField name="density">
          {(field): ReactElement => (
            <field.SelectField
              label="Density"
              description="Compact tightens spacing throughout the app."
              items={DENSITY_ITEMS}
            />
          )}
        </form.AppField>
      </Section>

      <Section heading="Avatars">
        <form.AppField name="showInChatAvatars">
          {(field): ReactElement => (
            <field.SwitchField
              label="Show avatars in chat"
              description="Hide to show only the speaker's name on each message."
            />
          )}
        </form.AppField>
        <form.AppField name="avatarSize">
          {(field): ReactElement => (
            <field.SelectField label="Avatar size" items={AVATAR_SIZE_ITEMS} />
          )}
        </form.AppField>
        <form.AppField name="avatarShape">
          {(field): ReactElement => (
            <field.SelectField label="Avatar shape" items={AVATAR_SHAPE_ITEMS} />
          )}
        </form.AppField>
      </Section>
    </Stack>
  );
}

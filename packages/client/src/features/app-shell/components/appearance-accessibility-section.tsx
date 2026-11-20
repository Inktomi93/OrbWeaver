// The "Accessibility" appearance SECTION: reduce motion, increase contrast and whether glass follows the device's
// reduced transparency. A settings
// contribution at the `appearance` anchor owned by features/app-shell, the feature that writes them to the root
// appearance channel. S1 — PATCH MINIMALITY: `OWNS` is spelled once and drives the projection, the seeded defaults,
// the form type and the contribution's `owns` claim (SET-SEAMS §2).

import type { AppearanceSettings } from "@orb/contracts/settings";
import { DEFAULT_APPEARANCE_SETTINGS } from "@orb/contracts/settings";
import { pickKeys } from "@orb/kit/objects";
import { Row, Section } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { ConfigTeachScope, QueryBoundary, SettingRow, SettingRowGroup } from "#components";
import { QueryErrorState, SkeletonRows, useInvalidation, useSuspenseQuery, useTRPC } from "#data";
import type { AutosaveSession } from "#forms/editor";
import { createAutosaveEntityForm, SectionSaveStatus } from "#forms/editor";
import { configSettingLabel } from "#state";
import { useUpdateAccessibility } from "../hooks/use-appearance-mutations.ts";
import { APPEARANCE_ACCESSIBILITY_KEYS, APPEARANCE_ACCESSIBILITY_SUBCATEGORY } from "../lib/appearance-accessibility-model.ts";
import { OS_PREFERENCE_ITEMS } from "../lib/appearance-select-items.ts";

type AccessibilityForm = Pick<AppearanceSettings, (typeof APPEARANCE_ACCESSIBILITY_KEYS)[number]>;

const AccessibilityAutosaveForm = createAutosaveEntityForm<AccessibilityForm>({
  defaultValues: pickKeys(DEFAULT_APPEARANCE_SETTINGS, APPEARANCE_ACCESSIBILITY_KEYS),
});

const ACCESSIBILITY_ENTITY_ID = "appearance-accessibility";

/** The Accessibility section body — mounted at the appearance pane's contributed-sections anchor. */
export function AppearanceAccessibilitySection({ anchorId, sectionId }: { readonly anchorId: string; readonly sectionId: string }): ReactElement {
  return (
    <QueryBoundary
      resetKeys={[]}
      fallback={<SkeletonRows count={3} shape="line" />}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="your accessibility settings" onRetry={retry} />}
    >
      <AccessibilityFormBody anchorId={anchorId} sectionId={sectionId} />
    </QueryBoundary>
  );
}

function AccessibilityFormBody({ anchorId, sectionId }: { readonly anchorId: string; readonly sectionId: string }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data } = useSuspenseQuery(trpc.settings.getUserSettings.queryOptions());
  const update = useUpdateAccessibility({ trpc, invalidation });

  const save = (values: AccessibilityForm): Promise<unknown> => update.mutateAsync({ section: "appearance", patch: values });

  return (
    <AccessibilityAutosaveForm entityId={ACCESSIBILITY_ENTITY_ID} serverValues={pickKeys(data.config.appearance, APPEARANCE_ACCESSIBILITY_KEYS)} save={save}>
      {(session): ReactElement => <AccessibilityBody anchorId={anchorId} sectionId={sectionId} session={session} />}
    </AccessibilityAutosaveForm>
  );
}

function AccessibilityBody({
  anchorId,
  sectionId,
  session,
}: {
  readonly anchorId: string;
  readonly sectionId: string;
  readonly session: AutosaveSession<AccessibilityForm>;
}): ReactElement {
  const { form, saveState, retrySave } = session;
  return (
    <Section container={true} divider={true} heading={APPEARANCE_ACCESSIBILITY_SUBCATEGORY.label} id={anchorId}>
      <ConfigTeachScope value={{ group: "appearance", sub: APPEARANCE_ACCESSIBILITY_SUBCATEGORY }}>
        <SettingRowGroup>
          <SettingRow settingId="reduced-motion">
            <form.AppField name="reducedMotion">
              {(field): ReactElement => (
                <field.SegmentField label={configSettingLabel(APPEARANCE_ACCESSIBILITY_SUBCATEGORY, "reducedMotion")} items={OS_PREFERENCE_ITEMS} />
              )}
            </form.AppField>
          </SettingRow>
          <SettingRow settingId="increased-contrast">
            <form.AppField name="increasedContrast">
              {(field): ReactElement => (
                <field.SegmentField label={configSettingLabel(APPEARANCE_ACCESSIBILITY_SUBCATEGORY, "increasedContrast")} items={OS_PREFERENCE_ITEMS} />
              )}
            </form.AppField>
          </SettingRow>
          <SettingRow settingId="follow-system-transparency">
            <form.AppField name="followSystemTransparency">
              {(field): ReactElement => <field.SwitchField label={configSettingLabel(APPEARANCE_ACCESSIBILITY_SUBCATEGORY, "followSystemTransparency")} />}
            </form.AppField>
          </SettingRow>
        </SettingRowGroup>
      </ConfigTeachScope>
      <Row gap="field" align="center">
        <SectionSaveStatus id={sectionId} state={saveState} onRetry={retrySave} />
      </Row>
    </Section>
  );
}

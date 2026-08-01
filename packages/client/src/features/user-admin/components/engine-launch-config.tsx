// The vLLM engine LAUNCH-config editor (Settings → Admin → Engines; #14). Reads the resolved launch config
// off settings.getAppSettings (env floor ⊕ admin override) and lets an admin retune the per-engine serve
// flags — the "good on our machine dies here" knobs: context windows, GPU-util fractions, vision max_pixels,
// and the model ids. Saving rides the SAME admin-gated settings.updateAppSettings path (which stamps the
// schema version); the new flags apply only on the NEXT engine restart, so a save arms a "restart to apply"
// banner. DEPLOYMENT facts (port + store path) are env-only and shown read-only in each engine's status row
// above (AdminEnginesSection's subtitle) — never edited here. Restarting the engines is the per-engine
// Restart button in AdminEnginesSection.

import type { EffectiveAppConfig, ResolvedEngineLaunch } from "@orb/contracts/settings";
import { Button } from "@orb/ui/button";
import { Field } from "@orb/ui/field";
import { Input } from "@orb/ui/input";
import { Stack } from "@orb/ui/layout";
import { NumberField } from "@orb/ui/number-field";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ChangeEvent, ReactElement } from "react";
import { useState } from "react";
import { useInvalidation, useTRPC } from "#data";
import { testId } from "#lib";
import { useUpdateAppSettings } from "../hooks/use-admin-mutations";
import { ENGINE_LAUNCH_NUMERIC_FIELDS, ENGINE_LAUNCH_TEXT_FIELDS } from "../lib/engine-launch-fields";

// The field set lives in lib/ (engine-launch-fields.ts) — the Engines contribution def derives its `owns`
// claim from the same tuples, so the editor and the partition claim can never drift apart.
const NUMERIC_FIELDS = ENGINE_LAUNCH_NUMERIC_FIELDS;
const TEXT_FIELDS = ENGINE_LAUNCH_TEXT_FIELDS;

type Draft = Record<keyof ResolvedEngineLaunch, string>;

function toDraft(el: ResolvedEngineLaunch): Draft {
  return Object.fromEntries(Object.entries(el).map(([k, v]) => [k, String(v)])) as Draft;
}

/** Diff the draft against the resolved baseline → the engineLaunch patch (only moved fields). Numeric
 *  strings coerce; a field equal to the baseline is omitted so an untouched value never becomes an override. */
function diffLaunch(baseline: ResolvedEngineLaunch, draft: Draft): Partial<ResolvedEngineLaunch> {
  const patch: Record<string, string | number> = {};
  for (const { key } of NUMERIC_FIELDS) {
    const n = Number(draft[key]);
    if (Number.isFinite(n) && n !== baseline[key]) {
      patch[key] = n;
    }
  }
  for (const { key } of TEXT_FIELDS) {
    const v = draft[key].trim();
    if (v.length > 0 && v !== baseline[key]) {
      patch[key] = v;
    }
  }
  return patch as Partial<ResolvedEngineLaunch>;
}

/** The engine launch-config form + restart-to-apply banner. */
export function EngineLaunchConfig(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const appSettings = useSuspenseQuery(trpc.settings.getAppSettings.queryOptions());
  const baseline: ResolvedEngineLaunch = (appSettings.data as EffectiveAppConfig).engineLaunch;

  const [draft, setDraft] = useState<Draft>(() => toDraft(baseline));
  // Armed after a successful save: the stored config changed but the running engines still serve the OLD
  // flags until restarted. Cleared when the admin re-syncs the draft (a fresh baseline read).
  const [pendingRestart, setPendingRestart] = useState(false);
  const save = useUpdateAppSettings({ trpc, invalidation });

  const patch = diffLaunch(baseline, draft);
  const dirty = Object.keys(patch).length > 0;

  const onSave = (): void => {
    save
      .mutateAsync({ partial: { engineLaunch: patch } })
      .then(() => setPendingRestart(true))
      .catch(() => undefined); // the sticky save.error slot surfaces the failure below
  };

  const set =
    (key: keyof ResolvedEngineLaunch) =>
    (e: ChangeEvent<HTMLInputElement>): void =>
      setDraft((d) => ({ ...d, [key]: e.target.value }));
  // The numeric knobs ride the NumberField primitive (`number | null`); the draft stays STRING-keyed
  // because the model-id fields share it and `diffLaunch` coerces. An emptied field parks "" — a
  // non-finite value `diffLaunch` drops, so a blank knob never becomes an override.
  const setNumeric =
    (key: keyof ResolvedEngineLaunch) =>
    (next: number | null): void =>
      setDraft((d) => ({ ...d, [key]: next === null ? "" : String(next) }));

  return (
    <Stack gap="row" data-testid={testId("engineLaunchConfig")}>
      <Text size="label" tone="muted">
        Launch config (models, context windows, GPU-util, vision caps). Applies on the NEXT engine restart.
      </Text>

      {pendingRestart ? (
        <Text size="label" tone="warning" data-testid={testId("engineLaunchPendingRestart")}>
          Saved. Restart each engine (buttons above) to apply the new launch flags — the running engines still serve the previous config.
        </Text>
      ) : null}

      <Stack gap="field">
        {TEXT_FIELDS.map(({ key, label }) => (
          <Field key={key} label={label} orientation="horizontal">
            <Input value={draft[key]} onChange={set(key)} data-testid={`engine-launch-${key}`} />
          </Field>
        ))}
        {NUMERIC_FIELDS.map((f) => (
          <Field key={f.key} label={f.label} orientation="horizontal" {...("hint" in f ? { hint: f.hint } : {})}>
            <NumberField step={f.step} value={draft[f.key] === "" ? null : Number(draft[f.key])} onValueChange={setNumeric(f.key)} />
          </Field>
        ))}
      </Stack>

      <Button intent="primary" size="sm" disabled={!dirty || save.isPending} onClick={onSave} data-testid={testId("engineLaunchSave")}>
        {save.isPending ? "Saving…" : "Save launch config"}
      </Button>
      {save.error === null ? null : (
        <Text size="label" tone="destructive">
          Couldn't save the launch config — administrators only.
        </Text>
      )}
    </Stack>
  );
}

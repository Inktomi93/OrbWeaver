// The Rate limits admin SECTION (Phase B ③) — the per-window request caps (publicIp / authed / aiTurn /
// login), an AppSettings admin-tier override each. Reads getAppSettingsWithOverrides so it shows the
// deployment floor beneath each field and whether the field is an active override; the section-level Reset
// clears the whole rateLimits override to the floor (the merge-safe `{ rateLimits: null }`). Saves the delta
// through the admin-gated updateAppSettings path.
//
// A settings-SECTION CONTRIBUTION (client-architecture-lockdown.md §6c) at the `admin` anchor, owned by
// user-admin (it owns the admin pane + the admin mutations). NOT its own top-level settings category.

import type { RateLimits, ResolvedRateLimits } from "@orb/contracts/settings";
import { clampRateLimit, RATE_LIMIT_CAP_MIN } from "@orb/contracts/settings";
import { Section, Stack } from "@orb/ui/layout";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { QueryBoundary, QueryErrorState, SkeletonRows, useInvalidation, useTRPC } from "#data";
import { useReportSaveStatus } from "#forms";
import { configAnchorId } from "#state";
import { useUpdateAppOverrides } from "../hooks/use-admin-mutations.ts";
import { envFloor, isOverridden, saveStateOf } from "../lib/app-override-model.ts";
import { RATE_LIMITS_SUBCATEGORY } from "../lib/rate-limits-nav.ts";
import { AdminOverrideField, AdminOverrideResetRow } from "./admin-override-field.tsx";

// The four editable caps, in display order — each a ResolvedRateLimits field (numeric, per-minute).
const FIELDS = [
  { key: "publicIp", label: "Anonymous requests / min / IP", hint: "Tight per-IP cap for un-authenticated callers." },
  { key: "authed", label: "Authenticated requests / min / user", hint: "Loose per-user request budget." },
  { key: "aiTurn", label: "AI turns / min / user", hint: "Stricter budget for $/GPU-spending chat verbs (debits on top of the request budget)." },
  { key: "login", label: "Login attempts / min / IP", hint: "Brute-force + scrypt-flood guard on the login route." },
] as const satisfies readonly { key: keyof ResolvedRateLimits; label: string; hint: string }[];

const RATE_LIMIT_STEP = 5;

type Draft = Record<keyof ResolvedRateLimits, string>;

function toDraft(r: ResolvedRateLimits): Draft {
  return { publicIp: String(r.publicIp), authed: String(r.authed), aiTurn: String(r.aiTurn), login: String(r.login) };
}

/** The only-moved-fields override delta: each draft value CLAMPED to the schema cap bounds (so an
 *  out-of-range input never reaches the write path and trips the silent-wipe `.catch`), included only when it
 *  differs from the resolved baseline. A non-finite draft clamps to `null` → dropped. */
function diffRateLimits(baseline: ResolvedRateLimits, draft: Draft): RateLimits {
  const patch: RateLimits = {};
  for (const { key } of FIELDS) {
    const clamped = clampRateLimit(Number(draft[key]));
    if (clamped !== null && clamped !== baseline[key]) {
      patch[key] = clamped;
    }
  }
  return patch;
}

/** The section's own suspense/error boundary so it is self-contained (renders inside the admin pane's
 *  boundary in-app, but also stands alone). */
export function RateLimitsSection({ sectionId }: { readonly sectionId: string }): ReactElement {
  return (
    // RESERVED (#1098) — an admin settings section that settles into one row per limit.
    <QueryBoundary
      fallback={<SkeletonRows count={4} />}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="rate limits — administrators only" onRetry={retry} />}
      reserveKey="config.admin.rateLimits"
    >
      <RateLimitsBody sectionId={sectionId} />
    </QueryBoundary>
  );
}

function RateLimitsBody({ sectionId }: { readonly sectionId: string }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data } = useSuspenseQuery(trpc.settings.getAppSettingsWithOverrides.queryOptions());
  const save = useUpdateAppOverrides({ trpc, invalidation });

  const baseline = data.resolved.rateLimits;
  const stored = data.overrides.rateLimits ?? null;
  const [draft, setDraft] = useState<Draft>(() => toDraft(baseline));

  const patch = diffRateLimits(baseline, draft);
  const dirty = Object.keys(patch).length > 0;
  const anyOverridden = FIELDS.some(({ key }) => isOverridden(stored?.[key]));
  useReportSaveStatus(sectionId, saveStateOf(save.isPending, save.error !== null));

  const onSave = (): void => {
    save.mutateAsync({ partial: { rateLimits: patch } }).catch(() => undefined); // sticky error slot below
  };
  // Reset the whole rateLimits override to the floor — a top-level `null` the deep-merge clears wholesale.
  // Re-sync the local draft to the RESOLVED floor the reset returned so each input VALUE flips to its default
  // alongside the "Using the deployment default" copy (side-eye P2 — `useState` inits once; the mutation
  // result is the server truth after the clear).
  const onReset = (): void => {
    save
      .mutateAsync({ partial: { rateLimits: null } })
      .then((resolvedAfter) => setDraft(toDraft(resolvedAfter.rateLimits)))
      .catch(() => undefined);
  };

  return (
    <Section divider={true} heading={RATE_LIMITS_SUBCATEGORY.label} id={configAnchorId("admin", RATE_LIMITS_SUBCATEGORY.id)}>
      <Stack gap="field">
        {FIELDS.map(({ key, label, hint }) => (
          <AdminOverrideField
            key={key}
            label={label}
            hint={hint}
            value={draft[key]}
            onChange={(next): void => setDraft((d) => ({ ...d, [key]: next }))}
            overridden={isOverridden(stored?.[key])}
            // `baseline` is floor ⊕ override, so it is the FLOOR only while no override is stored — once one
            // is, the env floor is gone from this read and the row must not echo the override back as its
            // own default (SET-SEAMS §4).
            floorValue={envFloor(isOverridden(stored?.[key]), baseline[key])}
            min={RATE_LIMIT_CAP_MIN}
            step={RATE_LIMIT_STEP}
          />
        ))}
        <AdminOverrideResetRow
          dirty={dirty}
          anyOverridden={anyOverridden}
          saving={save.isPending}
          errored={save.error !== null}
          onSave={onSave}
          onReset={onReset}
        />
      </Stack>
    </Section>
  );
}

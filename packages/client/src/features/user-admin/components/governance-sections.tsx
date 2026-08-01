// The two OWNER-GATED admin SECTIONS (SET-SEAMS stage 4) — Shared access (who may drive the box's shared
// local compute and the hosted subscription, plus the per-member compute budget) and Multi-user (whether
// additional humans may be seated locally, plus the discreet-login posture).
//
// ONE MODULE, ONE PREDICATE, deliberately (§4: the D17 owner-box governance fields "must land in ONE section
// together, so the owner-only disabled state is one predicate in one place"). They stay TWO sections so the
// nav rows, anchors and search leaves survive the move byte-identical (§7.1/§7.2), and share the
// module-private `useIsBoxOwner()` — a second copy of the gate is a parallel truth that drifts.
//
// The gate is UX honesty over a SERVER floor, never the enforcement: `updateAppSettings` calls
// `requireOwner` whenever a patch names one of these keys (key-presence, even an explicit `null` clear), so
// a delegated admin sees the controls disabled rather than bouncing off a 403 — and Multi-user's Reset
// clears only the keys the VIEWER may actually clear (`discreetLogin` is admin-writable; `localMultiUser`
// is not).

import type { AppSettings } from "@orb/contracts/settings";
import { Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { QueryBoundary, QueryErrorState, useInvalidation, useTRPC } from "#data";
import { useReportSaveStatus } from "#forms";
import { settingsAnchorId } from "#state";
import { useUpdateAppOverrides } from "../hooks/use-admin-mutations";
import { envFloorLabel, isOverridden, saveStateOf } from "../lib/app-override-model";
import { MULTI_USER_SUBCATEGORY, SHARED_ACCESS_SUBCATEGORY } from "../lib/system-config-nav";
import { AdminOverrideField, AdminOverrideResetRow, AdminOverrideSwitch } from "./admin-override-field";

/** Positive-int per-member budget; below this the schema drops the value (the floor would govern silently). */
const LOCAL_COMPUTE_BUDGET_MIN = 1;
const LOCAL_COMPUTE_BUDGET_STEP = 1;
/** What an ABSENT per-member budget means — the domain floor, i.e. no per-member cap at all. */
const BUDGET_UNBOUNDED_LABEL = "unbounded";

/** The ONE box-owner predicate the two governance sections share (see the header). Suspense-read, so the
 *  controls are never briefly enabled for a delegated admin while a probe resolves. */
function useIsBoxOwner(): boolean {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(trpc.sessions.me.queryOptions());
  return data.globalRole === "owner";
}

/** Shared access — the D17 governance trio, owner-only. Its own suspense/error boundary: it reads for
 *  itself, so it must recover for itself. */
export function SharedAccessSection({ sectionId }: { readonly sectionId: string }): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text voice="gloss">Loading shared access…</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="shared access — administrators only" onRetry={retry} />}
    >
      <SharedAccessBody sectionId={sectionId} />
    </QueryBoundary>
  );
}

function SharedAccessBody({ sectionId }: { readonly sectionId: string }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data } = useSuspenseQuery(trpc.settings.getAppSettingsWithOverrides.queryOptions());
  const isOwner = useIsBoxOwner();
  const save = useUpdateAppOverrides({ trpc, invalidation });

  const resolved = data.resolved;
  const overrides = data.overrides;
  const budget = resolved.nonOwnerLocalComputeBudget;
  const [budgetDraft, setBudgetDraft] = useState<string>(() => (budget === null ? "" : String(budget)));
  useReportSaveStatus(sectionId, saveStateOf(save.isPending, save.error !== null));

  const localOverridden = isOverridden(overrides.allowNonOwnerLocalCompute);
  const budgetOverridden = isOverridden(overrides.nonOwnerLocalComputeBudget);
  const proSubOverridden = isOverridden(overrides.allowNonOwnerMaxProSub);
  // A non-owner can clear nothing here (every key is owner-gated), so they never see a Reset that would 403.
  const anyOverridden = isOwner && (localOverridden || budgetOverridden || proSubOverridden);

  // The budget's own delta: a blank draft with a stored override is an explicit CLEAR (back to the
  // unbounded domain floor) — the one per-field clear this section has, since the whole-section Reset would
  // also drop the two switches. `null` = nothing to save (blank + no override, or an illegal value).
  const budgetPatch = ((): AppSettings | null => {
    const trimmed = budgetDraft.trim();
    if (trimmed === "") {
      return budgetOverridden ? { nonOwnerLocalComputeBudget: null } : null;
    }
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n < LOCAL_COMPUTE_BUDGET_MIN) {
      return null;
    }
    const rounded = Math.round(n);
    return rounded === budget ? null : { nonOwnerLocalComputeBudget: rounded };
  })();

  const write = (partial: AppSettings): void => {
    save.mutateAsync({ partial }).catch(() => undefined); // the sticky save.error slot surfaces the failure
  };
  const onReset = (): void => {
    save
      .mutateAsync({ partial: { allowNonOwnerLocalCompute: null, nonOwnerLocalComputeBudget: null, allowNonOwnerMaxProSub: null } })
      .then((after) => setBudgetDraft(after.nonOwnerLocalComputeBudget === null ? "" : String(after.nonOwnerLocalComputeBudget)))
      .catch(() => undefined);
  };

  return (
    <Section className="@container" divider={true} heading={SHARED_ACCESS_SUBCATEGORY.label} id={settingsAnchorId("admin", SHARED_ACCESS_SUBCATEGORY.id)}>
      <Stack gap="field">
        <Text voice="gloss">Who may spend this box's shared compute. Only the box owner can change these.</Text>
        <AdminOverrideSwitch
          label="Members may use shared local compute"
          hint="Let non-owner members drive your shared local compute (vLLM + in-process models). Local is shared-by-design."
          value={resolved.allowNonOwnerLocalCompute}
          overridden={localOverridden}
          floorLabel={envFloorLabel(localOverridden, resolved.allowNonOwnerLocalCompute ? "on" : "off")}
          onSet={(next): void => write({ allowNonOwnerLocalCompute: next })}
          disabled={!isOwner}
        />
        <AdminOverrideField
          label="Per-member local-compute budget"
          hint="Per-member turn/request budget for shared local compute, over the window set in System tuning. Empty = the domain floor (unbounded)."
          value={budgetDraft}
          onChange={setBudgetDraft}
          overridden={budgetOverridden}
          floorLabel={envFloorLabel(budgetOverridden, budget === null ? BUDGET_UNBOUNDED_LABEL : String(budget))}
          min={LOCAL_COMPUTE_BUDGET_MIN}
          step={LOCAL_COMPUTE_BUDGET_STEP}
          disabled={!isOwner}
        />
        <AdminOverrideSwitch
          label="Members may use the hosted subscription"
          hint="Let non-owner members drive your hosted max/pro subscription (ban-prone + real money). Off by default."
          value={resolved.allowNonOwnerMaxProSub}
          overridden={proSubOverridden}
          floorLabel={envFloorLabel(proSubOverridden, resolved.allowNonOwnerMaxProSub ? "on" : "off")}
          onSet={(next): void => write({ allowNonOwnerMaxProSub: next })}
          disabled={!isOwner}
        />
        <AdminOverrideResetRow
          dirty={isOwner && budgetPatch !== null}
          anyOverridden={anyOverridden}
          saving={save.isPending}
          errored={save.error !== null}
          onSave={(): void => {
            if (budgetPatch !== null) {
              write(budgetPatch);
            }
          }}
          onReset={onReset}
        />
      </Stack>
    </Section>
  );
}

/** Multi-user — the local-mode seating switch (owner-only) beside the login-page posture (admin-writable). */
export function MultiUserSection({ sectionId }: { readonly sectionId: string }): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text voice="gloss">Loading multi-user…</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="multi-user — administrators only" onRetry={retry} />}
    >
      <MultiUserBody sectionId={sectionId} />
    </QueryBoundary>
  );
}

function MultiUserBody({ sectionId }: { readonly sectionId: string }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data } = useSuspenseQuery(trpc.settings.getAppSettingsWithOverrides.queryOptions());
  const isOwner = useIsBoxOwner();
  const save = useUpdateAppOverrides({ trpc, invalidation });

  const resolved = data.resolved;
  const overrides = data.overrides;
  useReportSaveStatus(sectionId, saveStateOf(save.isPending, save.error !== null));

  const multiUserOverridden = isOverridden(overrides.localMultiUser);
  const discreetOverridden = isOverridden(overrides.discreetLogin);
  // Only the keys THIS viewer may clear count toward the Reset affordance (a delegated admin may clear the
  // login posture but not the seating switch), and the Reset patch names exactly those keys.
  const clearable: AppSettings = isOwner ? { localMultiUser: null, discreetLogin: null } : { discreetLogin: null };
  const anyOverridden = (isOwner && multiUserOverridden) || discreetOverridden;

  const write = (partial: AppSettings): void => {
    save.mutateAsync({ partial }).catch(() => undefined); // the sticky save.error slot surfaces the failure
  };

  return (
    <Section className="@container" divider={true} heading={MULTI_USER_SUBCATEGORY.label} id={settingsAnchorId("admin", MULTI_USER_SUBCATEGORY.id)}>
      <Stack gap="field">
        <Text voice="gloss">Seating and sign-in posture. Multi-CHARACTER chats always work; this is about additional HUMANS.</Text>
        <AdminOverrideSwitch
          label="Allow multiple humans (local mode)"
          hint="Let additional humans be invited and seated in rooms on a local-mode install. Off = single-human. No effect outside local mode. Owner-only."
          value={resolved.localMultiUser}
          overridden={multiUserOverridden}
          floorLabel={envFloorLabel(multiUserOverridden, resolved.localMultiUser ? "on" : "off")}
          onSet={(next): void => write({ localMultiUser: next })}
          disabled={!isOwner}
        />
        <AdminOverrideSwitch
          label="Discreet login"
          hint="Show a blank sign-in form — no handle pre-fill on the login page (no account enumeration)."
          value={resolved.discreetLogin}
          overridden={discreetOverridden}
          floorLabel={envFloorLabel(discreetOverridden, resolved.discreetLogin ? "on" : "off")}
          onSet={(next): void => write({ discreetLogin: next })}
        />
        <AdminOverrideResetRow anyOverridden={anyOverridden} saving={save.isPending} errored={save.error !== null} onReset={(): void => write(clearable)} />
      </Stack>
    </Section>
  );
}

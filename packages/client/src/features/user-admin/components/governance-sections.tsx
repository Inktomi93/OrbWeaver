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
import { QueryBoundary } from "#components";
import { QueryErrorState, SkeletonRows, useInvalidation, useTRPC } from "#data";
import { useReportSaveStatus } from "#forms";
import { configAnchorId } from "#state";
import { useUpdateAppOverrides } from "../hooks/use-admin-mutations.ts";
import { envFloor, isOverridden, saveStateOf } from "../lib/app-override-model.ts";
import { MULTI_USER_SUBCATEGORY } from "../lib/system-config-nav.ts";
import { AdminOverrideResetRow, AdminOverrideSwitch } from "./admin-override-field.tsx";

/** The ONE box-owner predicate the two governance sections share (see the header). Suspense-read, so the
 *  controls are never briefly enabled for a delegated admin while a probe resolves. */
function useIsBoxOwner(): boolean {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(trpc.sessions.me.queryOptions());
  return data.globalRole === "owner";
}

/** Multi-user — the local-mode seating switch (owner-only) beside the login-page posture (admin-writable). */
export function MultiUserSection({ sectionId }: { readonly sectionId: string }): ReactElement {
  return (
    // RESERVED (#1098) — the seating switch plus the login-page posture — a small but fixed knob stack.
    <QueryBoundary
      fallback={<SkeletonRows count={3} />}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="multi-user — administrators only" onRetry={retry} />}
      reserveKey="config.admin.multiUser"
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
    <Section className="@container" divider={true} heading={MULTI_USER_SUBCATEGORY.label} id={configAnchorId("admin", MULTI_USER_SUBCATEGORY.id)}>
      <Stack gap="field">
        <Text voice="gloss">Seating and sign-in posture. Multi-CHARACTER chats always work; this is about additional HUMANS.</Text>
        <AdminOverrideSwitch
          label="Allow multiple humans (local mode)"
          hint="Let additional humans be invited and seated in rooms on a local-mode install. Off = single-human. No effect outside local mode. Owner-only."
          value={resolved.localMultiUser}
          overridden={multiUserOverridden}
          floorLabel={envFloor(multiUserOverridden, resolved.localMultiUser ? "on" : "off")}
          onSet={(next): void => write({ localMultiUser: next })}
          disabled={!isOwner}
        />
        <AdminOverrideSwitch
          label="Discreet login"
          hint="Show a blank sign-in form — no handle pre-fill on the login page (no account enumeration)."
          value={resolved.discreetLogin}
          overridden={discreetOverridden}
          floorLabel={envFloor(discreetOverridden, resolved.discreetLogin ? "on" : "off")}
          onSet={(next): void => write({ discreetLogin: next })}
        />
        <AdminOverrideResetRow anyOverridden={anyOverridden} saving={save.isPending} errored={save.error !== null} onReset={(): void => write(clearable)} />
      </Stack>
    </Section>
  );
}

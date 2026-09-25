// The OWNER-GATED controls in the Multi-user admin SECTION (SET-SEAMS stage 4): whether additional humans
// may be seated locally and which private-network destinations authenticated endpoints may reach, beside
// the admin-writable discreet-login posture, the read-only "who can sign in" panel (`sharing-posture.tsx`) and the
// owner's Share card (`share-card.tsx`), which is omitted for anyone else.
//
// ONE MODULE, ONE PREDICATE, deliberately (§4: the D17 owner-box governance fields share one owner test).
// A second copy of the gate is a parallel truth that drifts.
//
// The gate is UX honesty over a SERVER floor, never the enforcement: `updateAppSettings` calls
// `requireOwner` whenever a patch names one of these keys (key-presence, even an explicit `null` clear), so
// a delegated admin sees the controls disabled rather than bouncing off a 403 — and Multi-user's Reset
// clears only the keys the VIEWER may actually clear (`discreetLogin` is admin-writable; `localMultiUser`
// is not).

import type { AppSettings } from "@orb/contracts/settings";
import { Field } from "@orb/ui/field";
import { Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { Textarea } from "@orb/ui/textarea";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { QueryBoundary } from "#components";
import { QueryErrorState, SkeletonRows, useInvalidation, useTRPC } from "#data";
import { useReportSaveStatus } from "#forms";
import { configAnchorId } from "#state";
import { useUpdateAppOverrides } from "../hooks/use-admin-mutations.ts";
import { envFloor, isOverridden, saveStateOf } from "../lib/app-override-model.ts";
import { MULTI_USER_SUBCATEGORY } from "../lib/system-config-nav.ts";
import { AdminOverrideResetRow, AdminOverrideSwitch } from "./admin-override-field.tsx";
import { ShareCard } from "./share-card.tsx";
import { SharingPosturePanel } from "./sharing-posture.tsx";

const ALLOWLIST_PLACEHOLDER = "127.0.0.1:8703\n192.168.1.0/24\nollama.lan:11434";

/** The ONE box-owner predicate the governance controls share (see the header). Suspense-read, so the
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
      fallback={<SkeletonRows count={4} />}
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
  const allowlistOverridden = isOverridden(overrides.privateEndpointAllowlist);
  const [allowlistDraft, setAllowlistDraft] = useState(() => resolved.privateEndpointAllowlist.join("\n"));
  const allowlistEntries = allowlistDraft
    .split("\n")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  const allowlistDirty = !sameEntries(allowlistEntries, resolved.privateEndpointAllowlist);
  const allowlistFloor = envFloor(allowlistOverridden, resolved.privateEndpointAllowlist);
  // Only the keys THIS viewer may clear count toward the Reset affordance (a delegated admin may clear the
  // login posture but not the owner-gated controls), and the Reset patch names exactly those keys.
  const clearable: AppSettings = isOwner ? { localMultiUser: null, discreetLogin: null, privateEndpointAllowlist: null } : { discreetLogin: null };
  const anyOverridden = (isOwner && (multiUserOverridden || allowlistOverridden)) || discreetOverridden;

  const write = (partial: AppSettings): void => {
    save.mutateAsync({ partial }).catch(() => undefined); // the sticky save.error slot surfaces the failure
  };
  const saveAllowlist = (): void => {
    save
      .mutateAsync({ partial: { privateEndpointAllowlist: allowlistEntries } })
      .then((resolvedAfter) => setAllowlistDraft(resolvedAfter.privateEndpointAllowlist.join("\n")))
      .catch(() => undefined);
  };
  // The Share card's one confirmed write: only the seating keys that are off, so the patch names nothing it keeps.
  const enableSeating = (): Promise<void> =>
    save
      .mutateAsync({ partial: { ...(resolved.localMultiUser ? {} : { localMultiUser: true }), ...(resolved.discreetLogin ? {} : { discreetLogin: true }) } })
      .then(() => undefined);
  const reset = (): void => {
    save
      .mutateAsync({ partial: clearable })
      .then((resolvedAfter) => setAllowlistDraft(resolvedAfter.privateEndpointAllowlist.join("\n")))
      .catch(() => undefined);
  };

  return (
    <Section className="@container" divider={true} heading={MULTI_USER_SUBCATEGORY.label} id={configAnchorId("admin", MULTI_USER_SUBCATEGORY.id)}>
      <Stack gap="field">
        <Text voice="gloss">Seating and sign-in posture. Multi-CHARACTER chats always work; this is about additional HUMANS.</Text>
        <SharingPosturePanel />
        {isOwner ? <ShareCard localMultiUser={resolved.localMultiUser} discreetLogin={resolved.discreetLogin} onEnableSeating={enableSeating} /> : null}
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
        <Field
          label="Allowed private endpoints"
          description={
            allowlistFloor === null
              ? "Overridden. Reset to fall back to this deployment's default."
              : `Using the deployment default: ${String(allowlistFloor.length)} ${allowlistFloor.length === 1 ? "entry" : "entries"}.`
          }
          hint="One per line: a host, CIDR range, or host:port. CIDR ranges do not support ports. Owner-only."
          disabled={!isOwner}
        >
          <Textarea rows={3} maxRows={8} value={allowlistDraft} onValueChange={setAllowlistDraft} placeholder={ALLOWLIST_PLACEHOLDER} />
        </Field>
        <AdminOverrideResetRow
          dirty={isOwner && allowlistDirty}
          anyOverridden={anyOverridden}
          saving={save.isPending}
          errored={save.error !== null}
          onSave={saveAllowlist}
          onReset={reset}
        />
      </Stack>
    </Section>
  );
}

function sameEntries(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

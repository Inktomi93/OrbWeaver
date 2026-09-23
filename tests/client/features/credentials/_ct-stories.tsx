// credentials feature CT stories (docs/law/Spine-Testing.md §7 — CT mounts ONLY from a non-test module).
// The story reaches a feature internal the front door doesn't re-export (the settings _ct-stories.tsx
// precedent) — CredentialKeyRow is mounted by the keys section itself, not exported standalone. The whole
// Connections group mounts as its three CONTRIBUTED sections through the config host's own resolver
// (`CtConfigGroupBody`) — the production render path, not a surface.

import { useInvalidation, useTRPC } from "@orb/client/data";
import { connectionsKeysSection, connectionsListSection, connectionsRolesSection } from "@orb/client/features/credentials";
import { SaveStatusHostContext } from "@orb/client/forms";
import { createContributorRegistry } from "@orb/client/lib";
import type { ConfigSectionContribution } from "@orb/client/state";
import { useAggregateSaveStatus } from "@orb/client/state";
import type { CredRevokedReason } from "@orb/contracts/credentials";
import type { ProviderId } from "@orb/contracts/inference";
import type { UserConnectionId, UserCredentialId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { ConnectionEditor } from "../../../../packages/client/src/features/credentials/components/connection-editor.tsx";
import { CredentialKeyRow } from "../../../../packages/client/src/features/credentials/components/credential-key-row.tsx";
import { CtConfigGroupBody, CtDataProviders } from "../../../support/browser/ct-data-providers.tsx";

/** The Connections group's three contributed sections, assembled as at the door. */
const connectionsSections: ReturnType<typeof createContributorRegistry<ConfigSectionContribution>> = createContributorRegistry<ConfigSectionContribution>(
  "config-sections",
  [connectionsListSection, connectionsRolesSection, connectionsKeysSection],
);

/** `<CredentialKeyRow>` under the data layer (`trpc`/`invalidation` read inside the provider tree — the
 *  row's own wiring); its mutations are stubbed per-test via routeTrpc. */
function CredentialKeyRowInner(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  return (
    <CredentialKeyRow
      credential={{
        id: castId<UserCredentialId>("user_credential_ctstory0001"),
        provider: castId<ProviderId>("openrouter"),
        label: "prod key",
        revokedAt: null,
        revokedReason: null,
        createdAt: 0,
        updatedAt: 0,
      }}
      usedBy={0}
      providerLabel="OpenRouter"
      invalidation={invalidation}
      trpc={trpc}
    />
  );
}

export function CredentialKeyRowStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 560 }}>
        <CredentialKeyRowInner />
      </div>
    </CtDataProviders>
  );
}

/** The same row with `usedBy: 1` — the reuse line's SINGULAR arm (§5.3a "used by N connections"). Its own
 *  story because `usedBy` is a prop the section computes, so there is no way to drive the branch from the
 *  network the way a stubbed read would let us. */
function ReusedCredentialKeyRowInner(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  return (
    <CredentialKeyRow
      credential={{
        id: castId<UserCredentialId>("user_credential_ctstory0004"),
        provider: castId<ProviderId>("openrouter"),
        label: "shared key",
        revokedAt: null,
        revokedReason: null,
        createdAt: 0,
        updatedAt: 0,
      }}
      usedBy={1}
      providerLabel="OpenRouter"
      invalidation={invalidation}
      trpc={trpc}
    />
  );
}

export function ReusedCredentialKeyRowStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 560 }}>
        <ReusedCredentialKeyRowInner />
      </div>
    </CtDataProviders>
  );
}

/** A `custom-openai` `<CredentialKeyRow>` — an endpoint key row (the bearer a self-hosted server may require). */
function CustomCredentialKeyRowInner(): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  return (
    <CredentialKeyRow
      credential={{
        id: castId<UserCredentialId>("user_credential_ctstory0002"),
        provider: castId<ProviderId>("custom-openai"),
        label: "my endpoint",
        revokedAt: null,
        revokedReason: null,
        createdAt: 0,
        updatedAt: 0,
      }}
      usedBy={0}
      providerLabel="Your own server"
      invalidation={invalidation}
      trpc={trpc}
    />
  );
}

export function CustomCredentialKeyRowStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 560 }}>
        <CustomCredentialKeyRowInner />
      </div>
    </CtDataProviders>
  );
}

/** A REVOKED `<CredentialKeyRow>` (revokedAt set) — the row that carries the "Clear revoked" recover
 *  pair (Clear revoked + Remove) instead of the active pair (Replace + Revoke). `reason` is the #1373 half: the row must be able to
 *  say WHICH of the three causes revoked it, so every member gets a mountable arm rather than one story
 *  standing in for a whole vocabulary. `credentials.clearRevoked` is stubbed per-test via routeTrpc.
 *  `reason: null` is the honest unknown (a writer that bypassed `setRevokedById`) — chip, no cause. */
function RevokedCredentialKeyRowInner({ reason }: { readonly reason: CredRevokedReason | null }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  return (
    <CredentialKeyRow
      credential={{
        id: castId<UserCredentialId>("user_credential_ctstory0003"),
        provider: castId<ProviderId>("openrouter"),
        label: "prod key",
        revokedAt: 1,
        revokedReason: reason,
        createdAt: 0,
        updatedAt: 0,
      }}
      usedBy={0}
      providerLabel="OpenRouter"
      invalidation={invalidation}
      trpc={trpc}
    />
  );
}

/** The AUTO-revoked arm — the one the post-generation strike-out produces (#1373). */
export function RevokedCredentialKeyRowStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 560 }}>
        <RevokedCredentialKeyRowInner reason="auth_failed" />
      </div>
    </CtDataProviders>
  );
}

/** The USER-revoked arm — the row must not claim a provider rejected a key its owner revoked themselves. */
export function UserRevokedCredentialKeyRowStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 560 }}>
        <RevokedCredentialKeyRowInner reason="user" />
      </div>
    </CtDataProviders>
  );
}

/** The UNREACHABLE arm — the health probe's strike limit, where nothing ever judged the key. */
export function UnreachableRevokedCredentialKeyRowStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 560 }}>
        <RevokedCredentialKeyRowInner reason="unreachable" />
      </div>
    </CtDataProviders>
  );
}

/** A revoked row whose reason the server never wrote — the pane shows the chip and NO cause, never a guess. */
export function ReasonlessRevokedCredentialKeyRowStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width: 560 }}>
        <RevokedCredentialKeyRowInner reason={null} />
      </div>
    </CtDataProviders>
  );
}

/** The whole Connections pane over the real data layer — the LIVE-vs-DRAFT surface (the 2026-08-01 phantom:
 *  a never-persisted selection rendered exactly like the live connection, under a "Saved" chip). Every read
 *  (`connection.list`, `connection.listBindings`, `credentials.list`) and the `connection.setBinding` write are stubbed per-test via routeTrpc. The "refetch settings"
 *  button stands in for the bus-driven `settingsChanged` refetch: the mutation is `busDriven: true`, so it
 *  invalidates nothing itself — the USER_BUS does, and a CT has no bus. */
function ConnectionsPaneInner(): ReactElement {
  const queryClient = useQueryClient();
  return (
    <div>
      <CtConfigGroupBody anchor="connections" sections={connectionsSections} />
      <button type="button" onClick={(): void => void queryClient.invalidateQueries()}>
        refetch settings
      </button>
    </div>
  );
}

export function ConnectionsSettingsStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 900, overflow: "auto", width: 960 }}>
        <ConnectionsPaneInner />
      </div>
    </CtDataProviders>
  );
}

/** The pane as the SETTINGS SHELL actually mounts it — under an aggregate save-status HOST (side-eye
 *  2026-08-06 P2). Model roles used to render its own bare "Saved" top-right while every other pane said
 *  "Saved · Synced across your devices." bottom-left in the shell's one footer; it now reports through the
 *  §3 seam instead, which means it renders NOTHING inline unless the save failed.
 *
 *  The aggregate is echoed into a marker rather than mounting the real footer: the footer is a
 *  `features/config` component with no front-door export, and reaching it by relative path would risk a
 *  second module instance of the store it reads — the marker reads the same store through the alias the
 *  pane itself uses, so there is exactly one. */
function AggregateMarker(): ReactElement {
  const aggregate = useAggregateSaveStatus();
  return <p data-testid="aggregate">{aggregate ?? "none"}</p>;
}

export function ConnectionsSettingsHostedStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 900, overflow: "auto", width: 960 }}>
        <SaveStatusHostContext value={true}>
          <ConnectionsPaneInner />
        </SaveStatusHostContext>
        <AggregateMarker />
      </div>
    </CtDataProviders>
  );
}

/** The pane at the SETTINGS BODY's two measured widths (inference program §13 step 3b): 870 with the
 *  context panel closed, 486 with it open. The mocks decided the two END STATES and `CtConfigGroupBody` is
 *  the production resolver, so these are the honest narrow/wide arms — a story sized wide is how a
 *  `shrink-0` cluster ships looking fine and lands clipped. A FIXED width with `overflow: visible`: a
 *  content-sized root agrees with the bug. */
function connectionsPaneAtWidth(width: number): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ height: 900, overflow: "visible", width }}>
        <ConnectionsPaneInner />
      </div>
    </CtDataProviders>
  );
}

/** 870px — the settings body with the context panel CLOSED. */
export function ConnectionsPaneWideStory(): ReactElement {
  return connectionsPaneAtWidth(870);
}

/** 486px — the settings body with the context panel OPEN, i.e. the width where a user is comparing this
 *  pane against a room. No copy is cut here: a row gloss WRAPS, and the F20 sentence is never dropped. */
export function ConnectionsPaneNarrowStory(): ReactElement {
  return connectionsPaneAtWidth(486);
}

/** THE CONNECTION EDITOR at the same two load-bearing widths. Mounted DIRECTLY rather than through the
 *  config host, because here the width is the SUBJECT: the story fixes the box and the editor's own
 *  `@container` decides every reflow inside it — which is also what makes the pair a proof of the mechanism,
 *  since the VIEWPORT is identical in both arms and a `@media` rule could not tell them apart. Every read
 *  (`connection.get`, `connection.providersAvailable`, `connection.capabilities`, `connection.catalogModels`,
 *  `sessions.me`, `settings.getAppSettingsWithOverrides`) and every write (`connection.update`,
 *  `connection.probe`, `settings.updateAppSettings`) is stubbed per-test via routeTrpc. */
function ConnectionEditorInner({ connectionId }: { readonly connectionId: string }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  return <ConnectionEditor connectionId={castId<UserConnectionId>(connectionId)} invalidation={invalidation} onDone={(): void => undefined} trpc={trpc} />;
}

export function ConnectionEditorStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ overflow: "auto", width: 870 }}>
        <ConnectionEditorInner connectionId="user_connection_cteditor0001" />
      </div>
    </CtDataProviders>
  );
}

/** The SAME editor in the 486 box — the width WITH the context panel open. */
export function ConnectionEditorNarrowStory(): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ overflow: "auto", width: 486 }}>
        <ConnectionEditorInner connectionId="user_connection_cteditor0001" />
      </div>
    </CtDataProviders>
  );
}

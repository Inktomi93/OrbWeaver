// Saved providers stay read-only because changing one invalidates credential, URL, model and kind.
// Disclosure tiers keep advanced controls collapsed; layout follows the settings container width.
// Capability and cache readback describe the resolved connection, not upstream acceptance or hits.

import { EMBED_SPACE_FIELDS, providerDisplayLabel } from "@orb/contracts/inference";
import type { UserConnectionId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Field } from "@orb/ui/field";
import { Container, Row, Stack } from "@orb/ui/layout";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement, ReactNode, RefObject } from "react";
import { useRef, useState } from "react";
import { QueryBoundary, useEmbedRefusalToastAfterUnmount, useReindexConfirm, useUpdateConnection } from "#components";
import type { Invalidation, Trpc } from "#data";
import { QueryErrorState, SkeletonRows } from "#data";
import { embedRefusalOf, embedRefusalText } from "#lib";
import { isClaudeSubscription } from "../lib/add-connection-form-model.ts";
import { capabilityFactRows, VECTOR_WIDTH_FACT_PATH } from "../lib/connection-capability-fact-model.ts";
import { capabilityBadges, declaredOverrideCount, diagnosticsSetCount, hostLabel, inferredKindOf, purposeNotes } from "../lib/connection-editor-model.ts";

import { withDeclaredOverride, withoutDeclaredOverride } from "../lib/connection-fact-model.ts";
import { promptCacheChangedCount, showsPromptCache } from "../lib/prompt-cache-model.ts";
import { ClaudeSubscriptionNotice } from "./claude-subscription-notice.tsx";
import { ConnectionAccount } from "./connection-account.tsx";
import { ModelField, SavedTextField } from "./connection-editor-essential.tsx";
import { factNoteOf, focusFact } from "./connection-editor-fact-note.tsx";
import { CapabilityRail, KindVerdict, PurposeNotes } from "./connection-editor-purpose.tsx";
import type { EditorEmbedderCheck, EditorEmbedRefusal } from "./connection-editor-refusal.tsx";
import { TopEmbedderNote } from "./connection-editor-refusal.tsx";
import { ConnectionEditorHeader, ConnectionEditorUnavailable } from "./connection-editor-unavailable.tsx";
import { ConnectionExtrasBlock } from "./connection-extras-editor.tsx";
import { FactRowList, QuirksBlock } from "./connection-fact-rows.tsx";
import { ConnectionInspector } from "./connection-inspector.tsx";
import { ConnectionPromptCache } from "./connection-prompt-cache.tsx";
import { ConnectionReachability } from "./connection-reachability.tsx";
import { ConnectionTransportEditor } from "./connection-transport-editor.tsx";

export interface ConnectionEditorProps {
  readonly connectionId: UserConnectionId;
  /** Land with the Advanced tier expanded: a door that sends the user to a stated fact (the context window). */
  readonly advancedOpen?: boolean | undefined;
  /** Back out of the editor — the list section owns which view it shows. */
  readonly onDone: () => void;
  /** Return to the list after a successful removal, where the list restores focus to a live control. */
  readonly onRemoved?: (() => void) | undefined;
  readonly removalFinalFocus?: RefObject<HTMLElement | null> | undefined;
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
}

type ConnectionView = inferOutput<Trpc["connection"]["get"]>;
type ProviderDef = inferOutput<Trpc["connection"]["providersAvailable"]>[number]["provider"];

export function ConnectionEditor(props: ConnectionEditorProps): ReactElement {
  return (
    // RESERVED (#1098) — the editor settles into four tier headers plus the two open tiers' fields.
    <QueryBoundary
      fallback={<SkeletonRows count={6} />}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="this connection" onRetry={retry} />}
      reserveKey="config.connections.editor"
    >
      <ConnectionEditorBody {...props} />
    </QueryBoundary>
  );
}

function ConnectionEditorBody({ connectionId, advancedOpen, onDone, onRemoved, removalFinalFocus, trpc, invalidation }: ConnectionEditorProps): ReactElement {
  const { data: connection } = useSuspenseQuery(trpc.connection.get.queryOptions({ connectionId }));
  const { data: available } = useSuspenseQuery(trpc.connection.providersAvailable.queryOptions());
  const provider = available.find((row) => row.provider.id === connection.providerId)?.provider;

  if (provider === undefined) {
    return (
      <ConnectionEditorUnavailable
        connection={connection}
        finalFocus={removalFinalFocus}
        invalidation={invalidation}
        onDone={onDone}
        onRemoved={onRemoved}
        trpc={trpc}
      />
    );
  }

  return (
    <AvailableConnectionEditorBody
      advancedOpen={advancedOpen}
      connection={connection}
      connectionId={connectionId}
      invalidation={invalidation}
      onDone={onDone}
      provider={provider}
      providers={available.map((row) => row.provider)}
      trpc={trpc}
    />
  );
}

function AvailableConnectionEditorBody({
  advancedOpen,
  connection,
  connectionId,
  onDone,
  provider,
  providers,
  trpc,
  invalidation,
}: ConnectionEditorProps & { readonly connection: ConnectionView; readonly provider: ProviderDef; readonly providers: readonly ProviderDef[] }): ReactElement {
  const { data: capabilityView } = useSuspenseQuery(trpc.connection.capabilities.queryOptions({ connectionId }));
  const update = useUpdateConnection({ trpc, invalidation });
  // The width editor closes as the confirm opens, so focus returns to the vector-width row itself, not the page and
  // not the row's first button (after a save that is Reset, one key press from undoing what was just saved).
  const factsRef = useRef<HTMLDivElement>(null);
  const reindex = useReindexConfirm(trpc, (): boolean => {
    const widthRow = factsRef.current?.querySelector<HTMLElement>(`[data-fact="${VECTOR_WIDTH_FACT_PATH}"]`) ?? null;
    widthRow?.focus();
    return widthRow === null;
  });
  // The last write the server refused because the embedder does not make the width it would state, or did not answer,
  // and the fact row it came from (`null` for a field above Advanced), so the reason is drawn where focus returns.
  const [embedRefusal, setEmbedRefusal] = useState<EditorEmbedRefusal | null>(null);
  const [checking, setChecking] = useState<EditorEmbedderCheck | null>(null);
  // Counts refused writes: an uncontrolled field keyed on the saved value alone would keep the refused draft, because a
  // refusal leaves that value unchanged.
  const [refusedWrites, setRefusedWrites] = useState(0);
  const toastRefusalIfClosed = useEmbedRefusalToastAfterUnmount();
  const providerLabel = providerDisplayLabel(provider);
  // A detecting row (`features.detectServer`) reads the quirks of the server it found; its own knob stays listed.
  const detected = providers.find((row) => row.id === capabilityView.detectedProviderId);
  const quirkFeatures = detected === undefined ? provider.features : { ...provider.features, ...detected.features };
  const quirkLabel = detected === undefined ? providerLabel : providerDisplayLabel(detected);
  const declared = connection.declared;
  const busy = update.isPending;

  // A patch to an identity field of the user's embedder can rebuild their index, so the server is asked first; any other
  // field is written straight through. A fact row's Override or Reset button goes away with the change, so focus returns
  // to the row, and a write the server checks the embedder for says so where its refusal would land.
  const patch = (part: Parameters<typeof update.mutate>[0]["patch"], factPath: string | null = null): void => {
    const write = (checksEmbedder: boolean): void => {
      if (checksEmbedder) {
        setChecking({ path: factPath });
      }
      const saved = update.mutateAsync({ connectionId, patch: part });
      toastRefusalIfClosed(saved, (refusal) => embedRefusalText(refusal, connection.label));
      // @orb-waive caught-failure-ownership(saved): a refusal becomes the editor's alert state; any other failure toasts
      // through the mutation's errorToast. Ends if that toast goes.
      void saved
        .then(
          (): void => setEmbedRefusal(null),
          (error: unknown): void => {
            const refusal = embedRefusalOf(error);
            setEmbedRefusal(refusal === null ? null : { refusal, path: factPath });
            if (refusal !== null) {
              setRefusedWrites((count) => count + 1);
            }
          },
        )
        .finally((): void => {
          setChecking(null);
          focusFact(factsRef.current, factPath);
        });
    };
    if (EMBED_SPACE_FIELDS.some((field) => part[field] !== undefined)) {
      reindex.guard({ kind: "update", connectionId, patch: part }, write);
    } else {
      write(false);
    }
  };

  const factNote = factNoteOf(checking, embedRefusal);

  return (
    // THE NAMED CONTAINER (see the header): every reflow below keys off THIS box, not the viewport.
    <Container className="@container/connection-editor" name="connection-editor">
      <Stack aria-busy={checking !== null} data-slot="connection-editor" gap="block">
        <ConnectionEditorHeader label={connection.label} onDone={onDone} />
        {reindex.dialog}
        <TopEmbedderNote checking={checking} refused={embedRefusal} />

        <EditorTier defaultOpen={true} title="Essential">
          <Stack gap="row">
            <Field
              description="Change it by adding another connection — a provider change would invalidate this row's key, URL and model at once."
              label="Provider"
            >
              <Text data-slot="connection-editor-provider" voice="datum">
                {providerLabel}
              </Text>
              {detected === undefined ? null : (
                <Text data-slot="connection-editor-detected" voice="gloss">
                  Detected: {quirkLabel}
                </Text>
              )}
            </Field>
            {connection.baseUrl === null ? (
              <Field description="Stored once and never shown again. Replace or revoke it under Saved keys." label="API key">
                <Text voice="datum">{connection.credentialId === null ? "none — this provider needs no key" : "saved"}</Text>
              </Field>
            ) : (
              <SavedTextField
                busy={busy}
                description="Your own server. Nothing is sent anywhere else."
                label="Server URL"
                onCommit={(next): void => patch({ baseUrl: next })}
                resetKey={refusedWrites}
                value={connection.baseUrl}
              />
            )}
            {isClaudeSubscription(provider) ? <ClaudeSubscriptionNotice /> : null}
            <ModelField
              busy={busy}
              connectionId={connectionId}
              kind={inferredKindOf(connection.tasks)}
              listOwner={hostLabel(connection.baseUrl, providerLabel)}
              model={connection.model}
              modelCheck={connection.modelCheck}
              onCommit={(next, check): void => patch({ model: next, modelCheck: check })}
              provider={provider}
              resetKey={refusedWrites}
            />
            <SavedTextField
              busy={busy}
              description="Auto-named from the provider and the model. Rename it if you keep several on one server."
              label="Name"
              onCommit={(next): void => patch({ label: next })}
              value={connection.label}
            />
          </Stack>
        </EditorTier>

        <EditorTier defaultOpen={true} title="Purpose">
          <Stack gap="row">
            <KindVerdict
              busy={busy}
              declared={declared}
              kind={inferredKindOf(capabilityView.tasks)}
              onChange={(next): void => patch({ declared: { ...declared, kind: next } })}
            />
            <Stack gap="tight">
              <Text voice="label">What it can be used for</Text>
              <CapabilityRail badges={capabilityBadges(capabilityView.capability, capabilityView.tasks)} />
              <Text voice="gloss">This connection is greyed out in Model roles for a role it can't serve, with the same reason.</Text>
            </Stack>
            <PurposeNotes notes={purposeNotes(capabilityView.capability, provider.auth === "endpoint")} />
            <Row align="start" gap="field" justify="between">
              <Stack className="min-w-0 grow" gap="tight">
                <Text voice="label">Allow background work</Text>
                <Text voice="gloss">
                  Summaries, extraction, captions, embeddings and reranking run unattended on this connection. Leave it off for anything you pay per call, or
                  for a subscription you'd rather spend on chat.
                </Text>
              </Stack>
              <Switch
                aria-label={`Allow background work on ${connection.label}`}
                checked={connection.allowBackground}
                className="shrink-0"
                disabled={busy}
                onCheckedChange={(checked): void => patch({ allowBackground: checked })}
              />
            </Row>
          </Stack>
        </EditorTier>

        {showsPromptCache(capabilityView.capability) ? (
          <EditorTier
            badge={overrideBadge(promptCacheChangedCount(connection.promptCache, capabilityView.capability))}
            defaultOpen={false}
            kicker="On or off · system prompt · depth · how long it lasts"
            title="Prompt caching"
          >
            <ConnectionPromptCache
              generation={capabilityView.capability.kind === "generation" ? capabilityView.capability.generation : null}
              policy={capabilityView.cache}
              warnings={capabilityView.cacheWarnings.map((warning) => warning.message)}
              busy={busy}
              defaultEnabled={
                capabilityView.capability.kind === "generation" ? capabilityView.capability.generation.turns?.promptCacheDefaultEnabled : undefined
              }
              fixedTtl={capabilityView.capability.kind === "generation" ? capabilityView.capability.generation.turns?.fixedCacheTtl : undefined}
              connectionId={connectionId}
              connectionLabel={connection.label}
              onReset={(): void => patch({ promptCache: null })}
              save={(next): Promise<unknown> => update.mutateAsync({ connectionId, patch: { promptCache: next } })}
              stored={connection.promptCache}
            />
          </EditorTier>
        ) : null}

        <EditorTier
          badge={overrideBadge(declaredOverrideCount(declared))}
          defaultOpen={advancedOpen === true}
          kicker="What this server accepts · Endpoint quirks"
          title="Advanced"
        >
          <Stack gap="block" ref={factsRef}>
            <Stack gap="tight">
              <Text voice="label">What this server accepts</Text>
              <Text voice="gloss">
                What we measured or were told about this model. It is a statement about the server, not a setting — changing a line here tells us what to
                believe, it does not change what the server does.
              </Text>
              <FactRowList
                busy={busy}
                note={factNote}
                onOverride={(row, value): void => patch({ declared: withDeclaredOverride(declared, row, value) }, row.path)}
                onReset={(row): void => patch({ declared: withoutDeclaredOverride(declared, row) }, row.path)}
                rows={capabilityFactRows(capabilityView.capability, declared, capabilityView.baseline)}
              />
            </Stack>
            <QuirksBlock
              busy={busy}
              declared={declared}
              note={factNote}
              onOverride={(row, value): void => patch({ declared: withDeclaredOverride(declared, row, value) }, row.path)}
              onReset={(row): void => patch({ declared: withoutDeclaredOverride(declared, row) }, row.path)}
              ownServer={provider.auth === "endpoint"}
              providerFeatures={quirkFeatures}
              providerLabel={quirkLabel}
            />
          </Stack>
        </EditorTier>

        <EditorTier
          badge={setBadge(diagnosticsSetCount(connection.extras, connection.transport))}
          defaultOpen={false}
          kicker="Extra request fields · Request & response shaping · reachability"
          title="Diagnostics"
        >
          <Stack gap="block">
            <ConnectionExtrasBlock busy={busy} extras={connection.extras} onCommit={(next): void => patch({ extras: next })} />
            {connection.baseUrl === null ? null : (
              <Stack gap="tight">
                <Text voice="label">Request &amp; response shaping</Text>
                <Text voice="gloss">
                  For a server that doesn't speak plain OpenAI. Headers go out with the request; the map reads a reply that puts things in different places.
                </Text>
                <ConnectionTransportEditor busy={busy} onCommit={(next): void => patch({ transport: next })} transport={connection.transport} />
                <ConnectionInspector connectionId={connectionId} invalidation={invalidation} trpc={trpc} />
              </Stack>
            )}
            <ConnectionReachability
              baseUrl={connection.baseUrl}
              connectionId={connectionId}
              invalidation={invalidation}
              trpc={trpc}
              wakeable={provider.features?.sleep !== undefined}
            />
            <ConnectionAccount connectionId={connectionId} invalidation={invalidation} provider={provider} trpc={trpc} />
          </Stack>
        </EditorTier>
      </Stack>
    </Container>
  );
}

/** ONE disclosure tier. `@orb/ui/collapsible` owns the a11y contract; this owns the header's grammar —
 *  chevron + title + count badge, with the collapsed tier's kicker summary beside it (a collapsed tier that
 *  is a bare word and a chevron is exactly the wrong thing at 486, where the user is comparing this pane
 *  against a room).
 *
 *  THE BADGE KEEPS ITS ONE SENTENCE AT BOTH WIDTHS. The mock shortens `3 fields overridden` → `3 overridden`
 *  below the crossover; a width-switched STRING is either duplicated in the accessible tree or dropped from
 *  it, so the header WRAPS instead. §5.3a's `declared_overrides_measured` string stays one sentence in its
 *  two homes (this badge and the connection row's). */
function EditorTier({
  title,
  badge,
  kicker,
  defaultOpen,
  children,
}: {
  readonly title: string;
  readonly badge?: string | undefined;
  readonly kicker?: string | undefined;
  readonly defaultOpen: boolean;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <Collapsible data-slot="connection-editor-tier" data-tier={title} defaultOpen={defaultOpen}>
      <CollapsibleTrigger chevron={false} className="w-full">
        <Row align="center" className="w-full flex-wrap" gap="field">
          <Text voice="label">{title}</Text>
          {badge === undefined ? null : (
            <Badge intent="info" size="sm" tone="soft">
              {badge}
            </Badge>
          )}
          {kicker === undefined ? null : (
            <Text className="min-w-0 truncate" voice="gloss">
              {kicker}
            </Text>
          )}
        </Row>
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <Stack gap="row" padding="field">
          {children}
        </Stack>
      </CollapsiblePanel>
    </Collapsible>
  );
}

/** §5.3a's `declared_overrides_measured` sentence, in its SECOND home. A tier with nothing in it shows NO
 *  badge — a `0` badge is a number you have to read to learn nothing (the mock design §2.4). */
function overrideBadge(count: number): string | undefined {
  return count === 0 ? undefined : `${String(count)} ${count === 1 ? "field" : "fields"} overridden`;
}

/** Diagnostics reads "N set", never "overridden": an Extras row and a transport map are ADDITIONS. */
function setBadge(count: number): string | undefined {
  return count === 0 ? undefined : `${String(count)} set`;
}

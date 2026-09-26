// THE CONNECTION EDITOR — §5.3a's four disclosure tiers over ONE saved connection (inference program step 9,
// built from the step-3b mock). §5.3a's schemas imply ~40 leaf
// fields on one endpoint form; a pane that rendered them flat would mirror SillyTavern's API drawer in a zod
// costume. So: Essential and Purpose OPEN, Advanced and Diagnostics COLLAPSED behind a count badge of
// non-default overrides, and a user who has touched nothing sees FOUR fields — provider, the key-or-URL,
// model, and the auto-minted `label` — plus one "how it's used" line, at 870 AND at 486, because collapsing
// is width-independent.
//
// THE TIERS ARE `@orb/ui/collapsible`, WHICH IS THE WHOLE A11Y ANSWER. The mock draws `.tierhead` as a
// `div` with `cursor: pointer` — no `aria-expanded`, no button role, no keyboard operation — and the mock design
// §5.2 names it "the single most likely thing to be copied verbatim". Base UI's Collapsible gives the button
// role, `aria-expanded`, `aria-controls` and Space/Enter for free; nothing here hand-rolls a disclosure.
//
// WIDTH ADAPTATION IS `@container`, NOT `@media` — the mock declares ZERO of either and the mock design §5.1 leaves
// the mechanism explicitly undecided, so it is decided HERE: the editor's root is the named container and
// every reflow keys off the container's `lg` step (512px). The settings body is 870 with the context panel
// closed and 486 with it open, and a media query cannot tell those apart — the viewport is identical.
// The three width-keyed reflows and where they live:
//   • the fact ROW stacks (`connection-fact-rows.tsx`),
//   • the extras key/value pair stacks (`connection-extras-editor.tsx`),
//   • the transport pair goes one-up (`connection-transport-editor.tsx`, whose header carries the measured
//     490px-of-content crossover the mock swept).
// The FOURTH — the capability rail truncating GREENS LAST — is here, because the truncation is itself a
// §5.3a ruling rather than a layout accident.
//
// WHAT IS DELIBERATELY ABSENT, each by DATA rather than omission:
//   • NO `api` control. `showsApiControl` is `apis.length > 1` and `1911bbcdd` retired the `responses` api,
//     so every built-in provider lists exactly one. A one-option combobox can only be gotten wrong.
//   • NO prefetch status surface. §8.3's per-row `downloading/ready/failed` line was STRUCK by owner ruling.
//   • NO per-chat or per-room override, anywhere. F20: a room never binds a connection.
//   • NO Prompt caching tier on a connection whose wire places no explicit cache markers (`showsPromptCache`
//     reads the capability's `turns.explicitPromptCache`): there the settings reach nothing. Where it shows it is
//     COLLAPSED, so the untouched editor is still the four fields at both widths.
//
// STATED DEVIATION — THE PROVIDER IS READ-ONLY ON A SAVED ROW. The mock's Board A draws it as a combobox,
// and the grouped four-`auth`-group picker it draws in Board G already ships, in the ADD flow
// (`add-connection-dialog.tsx` · `connections-model.ts::providerPickerItems`). Changing the provider of a
// SAVED row invalidates its credential, its base URL, its model and its kind at once; a control that starts
// that cascade and handles none of it is worse than no control. The row says so and points at the add flow.

import type { DeclaredCapability } from "@orb/contracts/inference";
import { providerDisplayLabel } from "@orb/contracts/inference";
import type { UserConnectionId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { Button } from "@orb/ui/button";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Field } from "@orb/ui/field";
import { ArrowLeft, Icon } from "@orb/ui/icons";
import { Container, Row, Stack } from "@orb/ui/layout";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { useId, useState } from "react";
import { QueryBoundary, useUpdateConnection } from "#components";
import type { Invalidation, Trpc } from "#data";
import { QueryErrorState, SkeletonRows } from "#data";
import type { ExtraRow } from "../lib/connection-editor-model.ts";
import {
  capabilityBadges,
  declaredOverrideCount,
  diagnosticsSetCount,
  extrasFromRows,
  hostLabel,
  inferredKindOf,
  rowsFromExtras,
} from "../lib/connection-editor-model.ts";
import type { FactRow } from "../lib/connection-fact-model.ts";
import { capabilityFactRows, quirkFactRows, withDeclaredOverride, withoutDeclaredOverride } from "../lib/connection-fact-model.ts";
import { promptCacheChangedCount, showsPromptCache } from "../lib/prompt-cache-model.ts";
import { ConnectionAccount } from "./connection-account.tsx";
import { ModelField, SavedTextField } from "./connection-editor-essential.tsx";
import { CapabilityRail, KindVerdict } from "./connection-editor-purpose.tsx";
import { ConnectionExtrasEditor } from "./connection-extras-editor.tsx";
import { FactRowList } from "./connection-fact-rows.tsx";
import { ConnectionInspector } from "./connection-inspector.tsx";
import { ConnectionPromptCache } from "./connection-prompt-cache.tsx";
import { ConnectionReachability } from "./connection-reachability.tsx";
import { ConnectionTransportEditor } from "./connection-transport-editor.tsx";

export interface ConnectionEditorProps {
  readonly connectionId: UserConnectionId;
  /** Back out of the editor — the list section owns which view it shows. */
  readonly onDone: () => void;
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
}

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

function ConnectionEditorBody({ connectionId, onDone, trpc, invalidation }: ConnectionEditorProps): ReactElement {
  const { data: connection } = useSuspenseQuery(trpc.connection.get.queryOptions({ connectionId }));
  const { data: available } = useSuspenseQuery(trpc.connection.providersAvailable.queryOptions());
  const { data: capabilityView } = useSuspenseQuery(trpc.connection.capabilities.queryOptions({ connectionId }));
  const update = useUpdateConnection({ trpc, invalidation });

  const provider = available.find((row) => row.provider.id === connection.providerId)?.provider;
  const providerLabel = provider === undefined ? connection.providerId : providerDisplayLabel(provider);
  const declared = connection.declared;
  const busy = update.isPending;

  const patch = (part: Parameters<typeof update.mutate>[0]["patch"]): void => {
    update.mutate({ connectionId, patch: part });
  };

  return (
    // THE NAMED CONTAINER (see the header): every reflow below keys off THIS box, not the viewport.
    <Container className="@container/connection-editor" name="connection-editor">
      <Stack data-slot="connection-editor" gap="block">
        <Row align="center" gap="field">
          <Button aria-label="Back to Connections" intent="ghost" onClick={onDone} size="sm">
            <Icon icon={ArrowLeft} size="sm" />
          </Button>
          <Text voice="label">{connection.label}</Text>
          <Row className="grow" gap="field" justify="end">
            <Button intent="secondary" onClick={onDone} size="sm">
              Done
            </Button>
          </Row>
        </Row>

        <EditorTier defaultOpen={true} title="Essential">
          <Stack gap="row">
            <Field
              description="Change it by adding another connection — a provider change would invalidate this row's key, URL and model at once."
              label="Provider"
            >
              <Text data-slot="connection-editor-provider" voice="datum">
                {providerLabel}
              </Text>
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
                value={connection.baseUrl}
              />
            )}
            <ModelField
              busy={busy}
              connectionId={connectionId}
              listOwner={hostLabel(connection.baseUrl, providerLabel)}
              model={connection.model}
              modelCheck={connection.modelCheck}
              onCommit={(next, check): void => patch({ model: next, modelCheck: check })}
              provider={provider}
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
            badge={overrideBadge(promptCacheChangedCount(connection.promptCache))}
            defaultOpen={false}
            kicker="On or off · system prompt · depth · how long it lasts"
            title="Prompt caching"
          >
            <ConnectionPromptCache
              busy={busy}
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
          defaultOpen={false}
          kicker="What this server accepts · Endpoint quirks"
          title="Advanced"
        >
          <Stack gap="block">
            <Stack gap="tight">
              <Text voice="label">What this server accepts</Text>
              <Text voice="gloss">
                What we measured or were told about this model. It is a statement about the server, not a setting — changing a line here tells us what to
                believe, it does not change what the server does.
              </Text>
              <FactRowList
                busy={busy}
                onOverride={(row, value): void => patch({ declared: withDeclaredOverride(declared, row, value) })}
                onReset={(row): void => patch({ declared: withoutDeclaredOverride(declared, row) })}
                rows={capabilityFactRows(capabilityView.capability, declared)}
              />
            </Stack>
            <QuirksBlock
              busy={busy}
              declared={declared}
              onOverride={(row, value): void => patch({ declared: withDeclaredOverride(declared, row, value) })}
              onReset={(row): void => patch({ declared: withoutDeclaredOverride(declared, row) })}
              providerFeatures={provider?.features}
              providerLabel={providerLabel}
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
            <ExtrasBlock busy={busy} extras={connection.extras} onCommit={(next): void => patch({ extras: next })} />
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
              wakeable={provider?.features?.sleep !== undefined}
            />
            {provider === undefined ? null : <ConnectionAccount connectionId={connectionId} invalidation={invalidation} provider={provider} trpc={trpc} />}
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

function QuirksBlock({
  providerFeatures,
  declared,
  providerLabel,
  busy,
  onOverride,
  onReset,
}: {
  readonly providerFeatures: Parameters<typeof quirkFactRows>[0];
  readonly declared: DeclaredCapability | null;
  readonly providerLabel: string;
  readonly busy: boolean;
  readonly onOverride: (row: FactRow, value: unknown) => void;
  readonly onReset: (row: FactRow) => void;
}): ReactElement | null {
  const rows = quirkFactRows(providerFeatures, declared?.features, providerLabel);
  if (rows.length === 0) {
    return null;
  }
  return (
    <Stack gap="tight">
      <Text voice="label">Endpoint quirks</Text>
      <Text voice="gloss">
        How this kind of server behaves, and where each answer came from. Read-only — override a line only when this box differs from the others of its kind.
      </Text>
      <FactRowList busy={busy} onOverride={onOverride} onReset={onReset} rows={rows} />
    </Stack>
  );
}

function ExtrasBlock({
  extras,
  busy,
  onCommit,
}: {
  readonly extras: Readonly<Record<string, unknown>> | null;
  readonly busy: boolean;
  readonly onCommit: (extras: Record<string, unknown> | null) => void;
}): ReactElement {
  const idPrefix = useId();
  const [rows, setRows] = useState<readonly ExtraRow[]>(() => rowsFromExtras(extras, (index) => `${idPrefix}-${String(index)}`));
  const [minted, setMinted] = useState(0);

  return (
    <Stack gap="tight">
      <Text voice="label">Extra request fields</Text>
      <Text voice="gloss">
        Sent with every request on this connection, merged last. Use it for a field your server takes and we don't send. Sampling knobs belong to the preset,
        not here.
      </Text>
      <ConnectionExtrasEditor
        busy={busy}
        mintRowId={(): string => {
          setMinted((count) => count + 1);
          return `${idPrefix}-new-${String(minted)}`;
        }}
        onChange={setRows}
        onCommit={(): void => onCommit(extrasFromRows(rows))}
        rows={rows}
      />
    </Stack>
  );
}

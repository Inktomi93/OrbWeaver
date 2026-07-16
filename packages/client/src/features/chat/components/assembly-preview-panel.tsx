// The assembly preview (task #28 — the CONTEXT panel's Preview tab). Read-only: renders what the model
// will see on the NEXT turn — the assembled prompt (static + dynamic halves + any in-history injections)
// plus the `AssembleTrace` (why each overrideable field's value won, which sections fired, world-info
// included/dropped, the flags). Pure leverage of the existing `chat.previewAssembly` verb (no new server
// work); the trace is orbweaver's own richer shape than neo's byte-dump.
//
// HOST-ONLY: `previewAssembly` is a host/admin debug surface server-side (the full prompt reveals merged
// member cards). The CONTEXT panel only mounts this tab for the host, so a member never reaches the query
// (which would NOT_FOUND). A member-scoped `previewSection` affordance is deferred (task #28 flag).

import type { AssembleTrace } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { estimateTokens } from "@orb/kit/tokens";
import { Badge } from "@orb/ui/badge";
import { Row, Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement, ReactNode } from "react";
import { QueryBoundary, QueryErrorState, useTRPC } from "#data";

export interface AssemblyPreviewPanelProps {
  readonly chatId: ChatId;
}

/** The Preview tab body — suspends on the host-only `previewAssembly` read, then renders it read-only. */
export function AssemblyPreviewPanel({ chatId }: AssemblyPreviewPanelProps): ReactElement {
  return (
    <QueryBoundary
      fallback={<Text tone="muted">Assembling the preview…</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="the preview" onRetry={retry} />}
    >
      <PreviewBody chatId={chatId} />
    </QueryBoundary>
  );
}

function PreviewBody({ chatId }: AssemblyPreviewPanelProps): ReactElement {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(trpc.chat.previewAssembly.queryOptions({ chatId }));
  const { prompt, trace } = data;

  return (
    <Stack gap="section">
      <Text size="label" tone="muted">
        What the model will see on the next turn. Read-only.
      </Text>

      <TokenEstimate staticText={prompt.static} dynamicText={prompt.dynamic} injections={prompt.afterHistory} />

      <OverrideSources sources={trace.overrideSources} />

      <PromptText heading="System prompt — static" text={prompt.static} emptyLabel="(empty)" />
      <PromptText heading="System prompt — dynamic" text={prompt.dynamic} emptyLabel="(none)" />

      {prompt.afterHistory.length > 0 ? (
        <Section heading={`In-history injections (${prompt.afterHistory.length})`}>
          <Stack gap="row">
            {prompt.afterHistory.map((injection, index) => (
              <Text
                // The afterHistory entries are positional + contentful, with no stable id on the wire;
                // the index is the stable key within one immutable preview render.
                // biome-ignore lint/suspicious/noArrayIndexKey: afterHistory entries are positional + id-less; the index is stable within one immutable preview render.
                key={index}
                size="code"
                className="whitespace-pre-wrap"
              >
                [{injection.role} @ depth {injection.depth}] {injection.content}
              </Text>
            ))}
          </Stack>
        </Section>
      ) : null}

      <TraceSummary trace={trace} />
    </Stack>
  );
}

/** An ADVISORY local token estimate (`@orb/kit/tokens` QuadChars — the same engine the server assembly
 *  uses) over the assembled prompt halves + in-history injections. Quiet mono stats (§4.3 rule 9). Not
 *  billing truth: the real count is the provider's post-turn `usage` (the estimator's own file header). */
function TokenEstimate({
  staticText,
  dynamicText,
  injections,
}: {
  readonly staticText: string;
  readonly dynamicText: string;
  readonly injections: readonly { readonly content: string }[];
}): ReactElement {
  const staticTokens = estimateTokens(staticText);
  const dynamicTokens = estimateTokens(dynamicText);
  const injectionTokens = injections.reduce((sum, inj) => sum + estimateTokens(inj.content), 0);
  const total = staticTokens + dynamicTokens + injectionTokens;
  return (
    <Section heading="Token estimate (advisory)">
      <Stack gap="field">
        <TokenLine label="System — static" value={staticTokens} />
        <TokenLine label="System — dynamic" value={dynamicTokens} />
        {injectionTokens > 0 ? <TokenLine label="In-history injections" value={injectionTokens} /> : null}
        <TokenLine label="Total" value={total} />
        <Text size="micro" tone="muted">
          Estimated locally (QuadChars) — the real count is the provider's post-turn usage.
        </Text>
      </Stack>
    </Section>
  );
}

/** One token-estimate row — label + a right-aligned mono count (`≈` marks it advisory). */
function TokenLine({ label, value }: { readonly label: string; readonly value: number }): ReactElement {
  return (
    <Row gap="block" justify="between" align="center">
      <Text size="label" tone="muted">
        {label}
      </Text>
      <Text size="code">{`≈ ${value}`}</Text>
    </Row>
  );
}

/** The resolved source of each room-overrideable field ("room override" / "from <Name>" / "merged"). */
function OverrideSources({ sources }: { readonly sources: AssembleTrace["overrideSources"] }): ReactElement | null {
  if (sources === undefined) {
    return null;
  }
  const rows: readonly { readonly label: string; readonly source: string | undefined }[] = [
    { label: "Main prompt", source: sources.mainPrompt },
    { label: "Post-history", source: sources.postHistory },
    { label: "Scenario", source: sources.scenario },
    { label: "Author's note", source: sources.authorsNote },
  ];
  const present = rows.filter((row) => row.source !== undefined);
  if (present.length === 0) {
    return null;
  }
  return (
    <Section heading="Where each field's value came from">
      <Stack gap="field">
        {present.map((row) => (
          <Row key={row.label} gap="block" justify="between" align="center">
            <Text size="label" tone="muted">
              {row.label}
            </Text>
            <Text size="label">{row.source}</Text>
          </Row>
        ))}
      </Stack>
    </Section>
  );
}

/** One labelled raw-text block (whitespace preserved so the prompt reads as the model receives it). */
function PromptText({ heading, text, emptyLabel }: { readonly heading: string; readonly text: string; readonly emptyLabel: string }): ReactElement {
  return (
    <Section heading={heading}>
      {text.trim() === "" ? (
        <Text tone="muted">{emptyLabel}</Text>
      ) : (
        <Text size="code" className="whitespace-pre-wrap">
          {text}
        </Text>
      )}
    </Section>
  );
}

/** The content-free trace: which sections fired, world-info in/out, and the boolean flags as badges. */
function TraceSummary({ trace }: { readonly trace: AssembleTrace }): ReactElement {
  const flags: readonly { readonly label: string; readonly on: boolean }[] = [
    { label: "Compact summary", on: trace.compactSummaryIncluded },
    { label: "Memory", on: trace.memoryIncluded },
    { label: "Guided instruction", on: trace.guidedInstructionIncluded },
  ];
  const activeFlags = flags.filter((flag) => flag.on);

  return (
    <Section heading="Trace">
      <Stack gap="field">
        <TraceLine label="Static sections" value={sectionList(trace.staticSections)} />
        <TraceLine label="Dynamic sections" value={sectionList(trace.dynamicSections)} />
        <TraceLine label="World info" value={`${trace.worldInfoIncluded} included, ${trace.worldInfoDropped.length} dropped`} />
        <TraceLine label="Injections" value={String(trace.chatInjectionsIncluded)} />
        {trace.matchedKeys.length > 0 ? <TraceLine label="Matched keys" value={trace.matchedKeys.map((match) => match.key).join(", ")} /> : null}
        {trace.staticCacheBusters.length > 0 ? <TraceLine label="Cache busters" value={trace.staticCacheBusters.join(", ")} /> : null}
        {activeFlags.length > 0 ? (
          <Row gap="field" align="center">
            {activeFlags.map((flag) => (
              <Badge key={flag.label} intent="info">
                {flag.label}
              </Badge>
            ))}
          </Row>
        ) : null}
      </Stack>
    </Section>
  );
}

function TraceLine({ label, value }: { readonly label: string; readonly value: ReactNode }): ReactElement {
  return (
    <Row gap="block" justify="between" align="center">
      <Text size="label" tone="muted">
        {label}
      </Text>
      <Text size="label">{value}</Text>
    </Row>
  );
}

function sectionList(sections: readonly string[]): string {
  return sections.length === 0 ? "—" : sections.join(", ");
}

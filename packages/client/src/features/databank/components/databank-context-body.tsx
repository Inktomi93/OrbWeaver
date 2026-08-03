// The Databank CONTEXT arm — "where this document fires" for the open document (databank-surface-spec §6,
// the `library.html` activation panel). Three blocks:
//
//   EVERYWHERE  — the ONE write this panel owns. Global attach is OWNER authority, so it lives on the
//                 document; per-chat attach is HOST authority and lives in the chat panel. The write lives
//                 where the authority lives (§2.1's carried rule — legacy's own file header states it).
//   ACTIVE IN   — read-only chips off `listAttachments` (global · N chats · N characters). A COUNT, not a
//                 roster: naming other people's rooms here would be a scope leak, and the chat-side rack is
//                 where a room's own membership is governed.
//   RETRIEVAL   — a POINTER, never a duplicate. How many passages get pulled and how close a match must be
//                 is the landed retrieval-knobs settings section, and this spec does not touch it; saying so
//                 here is what stops the library growing a second copy of those knobs.
//
// `kind:"single"` context ⇒ the NO-SELECTION arm is the section definition's `context.empty`, never this
// file: the shell only mounts a body when something is selected. What remains here is the GONE arm — the
// document was deleted (on this device or another) while its context was open.

import type { DocumentId } from "@orb/kit/ids";
import { Badge } from "@orb/ui/badge";
import { EmptyState } from "@orb/ui/empty-state";
import { FileText, Icon } from "@orb/ui/icons";
import { Row, Section, Stack, Surface } from "@orb/ui/layout";
import { Switch } from "@orb/ui/switch";
import { Text } from "@orb/ui/text";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { QueryBoundary, QueryErrorState, useInvalidation, useTRPC } from "#data";
import { useSelectedDocumentId } from "#state";
import { useAttachDocumentGlobal, useDetachDocumentGlobal } from "../hooks/use-databank-mutations.ts";
import { DATABANK_CONTEXT_EMPTY } from "../lib/databank-copy.ts";

export function DatabankContextBody(): ReactElement {
  const documentId = useSelectedDocumentId();
  // The shell mounts a `single` body UNCONDITIONALLY and hands it no result — only the body can read its own
  // selection — so the no-selection arm is rendered HERE, from the same copy the definition declares.
  if (documentId === null) {
    return <EmptyState description={DATABANK_CONTEXT_EMPTY.description} icon={<Icon icon={FileText} size="lg" />} title={DATABANK_CONTEXT_EMPTY.title} />;
  }
  return (
    // The shell wraps a `tabs` context in a boundary but NOT a `single` body (section-context-host), so this
    // panel owns the one its suspending reads need.
    <QueryBoundary
      fallback={<Text voice="gloss">Loading…</Text>}
      renderError={(_error, retry): ReactElement => <QueryErrorState label="this document's attachments" onRetry={retry} />}
    >
      <ContextBody documentId={documentId} />
    </QueryBoundary>
  );
}

/** The CONTEXT BAND's identity (`ContextDefinition.header`, the §6b P4 slot) — `library.html`'s "Document",
 *  unconditionally, because the band names what this PANE is about rather than what happens to be open.
 *
 *  Without it the band fell back to the shell's neutral "Details", which named nothing over three blocks
 *  that answer where a document FEEDS, and collided with the CONTENT pane's own "Details" group heading
 *  ~950px to its left — the generic-band finding the config workspace was swept for first (side-eye
 *  2026-08-03 P3). It never doubles the body: the no-selection arm says "Where a document fires" and the
 *  open arm's blocks are "Everywhere / Active in / Retrieval". */
export function DatabankContextHeader(): ReactElement {
  return (
    // `kicker` — a BAND's name, painted like the LIST band on the same horizon (`ListPaneHeader`'s
    // micro-caps), not like a datum's label. Same measured mismatch the config workspace was swept for.
    <Text as="span" voice="kicker">
      Document
    </Text>
  );
}

function ContextBody({ documentId }: { readonly documentId: DocumentId }): ReactElement {
  const trpc = useTRPC();
  const { data: documents } = useSuspenseQuery(trpc.databank.list.queryOptions({}));
  const doc = documents.find((row) => row.id === documentId);

  if (doc === undefined) {
    return (
      <EmptyState description="This document was deleted. Pick another on the left." icon={<Icon icon={FileText} size="lg" />} title="Document not found" />
    );
  }
  return (
    // `instrument` with a form island (density §3 blesses exactly this nesting for a context panel).
    <Surface tier="instrument">
      <Stack gap="section" padding="block">
        <EverywhereSection documentId={doc.id} name={doc.name} />
        <ActiveInSection documentId={doc.id} />
        <Section heading="Retrieval">
          <Text voice="gloss">How many passages get pulled, and how close a match must be, is tuned in Settings → Chat behavior → Databank.</Text>
        </Section>
      </Stack>
    </Surface>
  );
}

function EverywhereSection({ documentId, name }: { readonly documentId: DocumentId; readonly name: string }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: globalIds } = useSuspenseQuery(trpc.databank.listGlobal.queryOptions());
  const attach = useAttachDocumentGlobal({ trpc, invalidation });
  const detach = useDetachDocumentGlobal({ trpc, invalidation });

  const isGlobal = globalIds.includes(documentId);

  return (
    <Section heading="Everywhere">
      <Row align="center" gap="row" justify="between">
        <Text voice="gloss">Feed this document to every chat, on top of any per-chat or per-character attachments.</Text>
        <Switch
          aria-label={isGlobal ? `Stop feeding ${name} to every chat` : `Feed ${name} to every chat`}
          checked={isGlobal}
          onCheckedChange={(on): void => {
            if (on) {
              attach.mutate({ documentId });
            } else {
              detach.mutate({ documentId });
            }
          }}
        />
      </Row>
    </Section>
  );
}

/** One scope's chip, or nothing when that scope is empty — pluralized by its own count. Split out because
 *  three inline count-and-pluralize ternaries in one component is what tripped the complexity ceiling. */
function ScopeChip({ count, singular, plural }: { readonly count: number; readonly singular: string; readonly plural: string }): ReactElement | null {
  if (count === 0) {
    return null;
  }
  return (
    <Badge intent="neutral" size="sm" tone="soft">
      {count === 1 ? `1 ${singular}` : `${String(count)} ${plural}`}
    </Badge>
  );
}

/** Read-only provenance: WHERE this document is switched on. Non-suspending — the panel's own two reads
 *  already resolved, and a slow junction read must not blank the toggle above it. */
function ActiveInSection({ documentId }: { readonly documentId: DocumentId }): ReactElement {
  const trpc = useTRPC();
  const attachments = useQuery(trpc.databank.listAttachments.queryOptions({ id: documentId }));

  const chats = attachments.data?.chatIds.length ?? 0;
  const characters = attachments.data?.characterIds.length ?? 0;
  const everywhere = attachments.data?.global === true;
  const nowhere = !everywhere && chats === 0 && characters === 0;

  return (
    <Section heading="Active in">
      {attachments.isPending ? (
        <Text voice="gloss">Checking…</Text>
      ) : (
        <Row align="center" gap="field">
          {everywhere ? (
            <Badge intent="success" size="sm" tone="soft">
              Every chat
            </Badge>
          ) : null}
          <ScopeChip count={chats} plural="chats" singular="chat" />
          <ScopeChip count={characters} plural="characters" singular="character" />
          {/* Never render nothing: "no attachments" is a real, common state and a blank block reads as a
              failed load (empty states are load-bearing). */}
          {nowhere ? <Text voice="gloss">Nowhere yet — it only feeds chats you attach it to.</Text> : null}
        </Row>
      )}
    </Section>
  );
}

// Names the documents an indexing run could not index and the error each hit. The databank keeps no per-document status
// column, so the run's result is the only record; each row opens its document in the Databank.

import type { DocumentId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Row, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { inferOutput } from "@trpc/tanstack-react-query";
import type { ReactElement } from "react";
import type { Trpc } from "#data";
import { useGatedQuery, useTRPC } from "#data";
import { selectDocumentFromList, setActiveSection } from "#state";
import {
  openFailedDocumentName,
  WORKLOAD_FAILED_DOCUMENT_ERROR_MAX,
  WORKLOAD_FAILED_DOCUMENT_GONE_NAME,
  WORKLOAD_FAILED_DOCUMENTS_SHOWN,
  workloadFailedDocumentLine,
  workloadFailedDocumentsMore,
} from "../lib/workloads-names.ts";

type WorkloadItem = inferOutput<Trpc["workloads"]["list"]>[number];

function FailedDocumentRow({ documentId, error }: { readonly documentId: DocumentId; readonly error: string }): ReactElement {
  const trpc = useTRPC();
  const document = useGatedQuery(documentId, (id) => trpc.databank.get.queryOptions({ id }));
  // A deleted document has nothing to open, so it names itself as gone instead of by its id.
  const name = document.data?.name ?? (document.isError ? WORKLOAD_FAILED_DOCUMENT_GONE_NAME : documentId);
  return (
    <Row align="center" gap="row" wrap={true} data-slot="workload-failed-document">
      <Text tone="warning" voice="gloss">
        {workloadFailedDocumentLine(name, error.slice(0, WORKLOAD_FAILED_DOCUMENT_ERROR_MAX))}
      </Text>
      {document.data === undefined ? null : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={openFailedDocumentName(name)}
          onClick={(): void => {
            selectDocumentFromList(documentId);
            setActiveSection("databank");
          }}
        >
          Open
        </Button>
      )}
    </Row>
  );
}

export function WorkloadFailedDocuments({ workload }: { readonly workload: WorkloadItem }): ReactElement | null {
  const failed =
    !workload.poison && (workload.kind === "databank-ingest" || workload.kind === "databank-reindex") && workload.status === "succeeded"
      ? (workload.result?.failed ?? [])
      : [];
  if (failed.length === 0) {
    return null;
  }
  return (
    <Stack gap="field">
      {failed.slice(0, WORKLOAD_FAILED_DOCUMENTS_SHOWN).map(({ documentId, error }) => (
        <FailedDocumentRow key={documentId} documentId={documentId} error={error} />
      ))}
      {failed.length > WORKLOAD_FAILED_DOCUMENTS_SHOWN ? (
        <Text tone="warning" voice="gloss">
          {workloadFailedDocumentsMore(failed.length - WORKLOAD_FAILED_DOCUMENTS_SHOWN)}
        </Text>
      ) : null}
    </Stack>
  );
}

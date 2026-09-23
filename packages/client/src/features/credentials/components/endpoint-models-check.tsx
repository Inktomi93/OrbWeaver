// The add dialog's "List models" step for an endpoint draft: the SERVER-SIDE `GET <baseUrl>/v1/models`
// (§7.4, a browser cannot reach a user's loopback box). Advisory — it never blocks submit; its answer feeds the
// model picker, and an empty or failed list is the picker's typed arm with its reason and a retry.
//
// THE DRAFT'S KEY RIDES THE DIAL. Before the key is saved it is the pasted draft; after a partial failure the
// dialog holds the saved row instead, so a re-list names that row by id rather than dialing without the key
// the server needs (a 401 that would read as "the server has no models").
//
// THE BUTTON STAYS FOCUSABLE WHILE PENDING (`loading`, which renders `aria-disabled`): a natively disabled
// button drops focus to the document, and the picker then takes the caret when the list lands.

import { errorMessage } from "@orb/kit/error-message";
import type { UserCredentialId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Row } from "@orb/ui/layout";
import type { ReactElement } from "react";
import type { Invalidation, Trpc } from "#data";
import { trpcErrorReason } from "#lib";
import { useListEndpointModels } from "../hooks/use-connections-mutations.ts";
import { draftKeyOf, URL_REFUSAL_CODES } from "../lib/add-connection-form-model.ts";
import { failedCatalogSource, modelListSource } from "../lib/model-picker-model.ts";
import type { ModelPickerProps } from "./model-picker.tsx";

/** One endpoint list answer, and the draft (`draftKeyOf`) it is an answer about. */
export interface EndpointListing {
  readonly forDraft: string;
  readonly source: ModelPickerProps["source"];
}

export interface EndpointModelsCheckProps {
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
  readonly baseUrl: string;
  readonly keyValue: string;
  /** The key this dialog already saved, once a connection write failed after the mint. */
  readonly heldCredentialId: UserCredentialId | null;
  readonly onListing: (listing: EndpointListing) => void;
  /** A refusal of the URL itself — the dialog puts it on the Server URL field. */
  readonly onUrlRefusal: (message: string) => void;
}

/** What authenticates the dial: the pasted draft key, else the key this dialog already saved, else nothing. */
function dialAuth(keyValue: string, heldCredentialId: UserCredentialId | null): { readonly key?: string; readonly credentialId?: UserCredentialId } {
  const key = keyValue.trim();
  if (key !== "") {
    return { key };
  }
  return heldCredentialId === null ? {} : { credentialId: heldCredentialId };
}

export function EndpointModelsCheck({
  trpc,
  invalidation,
  baseUrl,
  keyValue,
  heldCredentialId,
  onListing,
  onUrlRefusal,
}: EndpointModelsCheckProps): ReactElement {
  const list = useListEndpointModels({ trpc, invalidation });

  const runCheck = (): void => {
    const draftBaseUrl = baseUrl.trim();
    if (draftBaseUrl === "") {
      return;
    }
    const forDraft = draftKeyOf(baseUrl, keyValue);
    onListing({ forDraft, source: { status: "loading" } });
    void list
      .mutateAsync({ baseUrl: draftBaseUrl, ...dialAuth(keyValue, heldCredentialId) })
      .then((result): void => onListing({ forDraft, source: modelListSource(result, runCheck) }))
      .catch((err: unknown): void => {
        onListing({ forDraft, source: failedCatalogSource(err, runCheck) });
        if (URL_REFUSAL_CODES.has(trpcErrorReason(err))) {
          onUrlRefusal(errorMessage(err));
        }
      })
      // The answer now lives in the listing; drop the mutation's retained variables, which carry the draft key.
      .finally(list.clearError);
  };

  return (
    <Row align="center" gap="field">
      <Button disabled={baseUrl.trim() === ""} intent="secondary" loading={list.isPending} onClick={runCheck} size="sm">
        List models
      </Button>
    </Row>
  );
}

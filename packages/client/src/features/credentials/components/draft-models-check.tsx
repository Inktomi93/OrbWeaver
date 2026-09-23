// The add dialog's "List models" step for a draft that is read on demand (§7.4): an endpoint's SERVER-SIDE
// `GET <baseUrl>/v1/models` (a browser cannot reach a user's loopback box), or a hosted provider's list under the
// key pasted for it. Both go through `connection.draftCatalogModels`, a POST, under the draft's provider.
// Advisory — it never blocks submit; its answer feeds the model picker, and an empty or failed list is the
// picker's typed arm with its reason and a retry.
//
// THE DRAFT'S KEY RIDES THE DIAL. Before the key is saved it is the pasted draft; after a partial failure the
// dialog holds the saved row instead, so a re-list names that row by id rather than dialing without the key
// the server needs (a 401 that would read as "the server has no models"). Once the answer lands, the mutation's
// retained variables (which carry the key) are dropped.
//
// THE BUTTON STAYS FOCUSABLE WHILE PENDING (`loading`, which renders `aria-disabled`): a natively disabled
// button drops focus to the document, and the picker then takes the caret when the list lands.

import type { ProviderDef } from "@orb/contracts/inference";
import { errorMessage } from "@orb/kit/error-message";
import type { UserCredentialId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Row } from "@orb/ui/layout";
import type { ReactElement } from "react";
import type { Invalidation, Trpc } from "#data";
import { trpcErrorReason } from "#lib";
import { useDraftCatalogModels } from "../hooks/use-connections-mutations.ts";
import { draftKeyOf, URL_REFUSAL_CODES } from "../lib/add-connection-form-model.ts";
import { failedCatalogSource, modelListSource } from "../lib/model-picker-model.ts";
import type { ModelPickerProps } from "./model-picker.tsx";

/** One draft's model-list answer, and the draft (`draftKeyOf`) it is an answer about. */
export interface DraftListing {
  readonly forDraft: string;
  readonly source: ModelPickerProps["source"];
}

export interface DraftModelsCheckProps {
  readonly trpc: Trpc;
  readonly invalidation: Invalidation;
  readonly providerId: ProviderDef["id"];
  /** The endpoint's typed server URL; `null` for a hosted provider, which fixes its own. */
  readonly baseUrl: string | null;
  readonly keyValue: string;
  /** The key this dialog already saved, once a connection write failed after the mint. */
  readonly heldCredentialId: UserCredentialId | null;
  readonly onListing: (listing: DraftListing) => void;
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

export function DraftModelsCheck({
  trpc,
  invalidation,
  providerId,
  baseUrl,
  keyValue,
  heldCredentialId,
  onListing,
  onUrlRefusal,
}: DraftModelsCheckProps): ReactElement {
  const list = useDraftCatalogModels({ trpc, invalidation });
  const auth = dialAuth(keyValue, heldCredentialId);
  // An endpoint needs its URL (its key is optional); a hosted list needs the key it is read under.
  const ready = baseUrl === null ? Object.keys(auth).length > 0 : baseUrl.trim() !== "";

  const runCheck = (): void => {
    if (!ready) {
      return;
    }
    const forDraft = draftKeyOf({ providerId, baseUrl: baseUrl ?? "", key: keyValue });
    onListing({ forDraft, source: { status: "loading" } });
    void list
      .mutateAsync({ providerId, ...(baseUrl === null ? {} : { baseUrl: baseUrl.trim() }), ...auth })
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
      <Button disabled={!ready} intent="secondary" loading={list.isPending} onClick={runCheck} size="sm">
        List models
      </Button>
    </Row>
  );
}

// The add dialog's model-list read for a draft that lists under what the user supplies (§7.4): an endpoint's
// SERVER-SIDE `GET <baseUrl>/v1/models` (a browser cannot reach a user's loopback box), on "List models"; or a
// hosted provider's list under its key, read by itself once the key is pasted or a saved key is chosen. Both go
// through `connection.draftCatalogModels`, a POST, under the draft's provider.
// Advisory — it never blocks submit; its answer feeds the model picker, and an empty or failed list is the
// picker's typed arm with its reason and a retry.
//
// THE DRAFT'S KEY RIDES THE DIAL. Before the key is saved it is the pasted draft; after a partial failure the
// dialog holds the saved row instead, so a re-list names that row by id rather than dialing without the key
// the server needs (a 401 that would read as "the server has no models"). Once the answer lands, the mutation's
// retained variables (which carry the key) are dropped.
//
// A TYPED URL IS NOT A DRAFT YET: an endpoint lists only on the press, because a half-typed address would dial
// (and be refused) per keystroke. A hosted key is read once it stops changing (`KEY_LIST_SETTLE_MS`), a saved key
// at once. A dialog holding a key it already minted keeps its listing and reads nothing further.
//
// THE ENDPOINT BUTTON STAYS FOCUSABLE WHILE PENDING (`loading`, which renders `aria-disabled`): a natively disabled
// button drops focus to the document, and the picker then takes the caret when the list lands.

import type { ProviderDef } from "@orb/contracts/inference";
import type { UserCredentialId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Row } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useEffect, useEffectEvent } from "react";
import type { Invalidation, Trpc } from "#data";
import { trpcErrorReason } from "#lib";
import { useDraftCatalogModels } from "../hooks/use-connections-mutations.ts";
import { draftKeyOf, KEY_LIST_SETTLE_MS, URL_REFUSAL_CODES } from "../lib/add-connection-form-model.ts";
import { LIST_MODELS_NAME } from "../lib/credentials-names.ts";
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
  readonly credentialUnavailable?: boolean;
  /** The selected saved key, or the key this dialog minted before a failed connection write. */
  readonly heldCredentialId: UserCredentialId | null;
  /** Whether a hosted draft lists by itself as its key changes: off once the dialog holds a minted key, whose listing it keeps. */
  readonly listsOnInput: boolean;
  readonly onListing: (listing: DraftListing) => void;
  /** A refusal of the URL itself (the caught error) — the dialog puts it on the Server URL field. */
  readonly onUrlRefusal: (err: unknown) => void;
}

/** What authenticates the dial: a pasted draft key, a saved credential id, or nothing. */
function dialAuth(
  keyValue: string,
  heldCredentialId: UserCredentialId | null,
): { readonly key: string; readonly credentialId?: never } | { readonly key?: never; readonly credentialId?: UserCredentialId } {
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
  credentialUnavailable = false,
  heldCredentialId,
  listsOnInput,
  onListing,
  onUrlRefusal,
}: DraftModelsCheckProps): ReactElement | null {
  const list = useDraftCatalogModels({ trpc, invalidation, failureShownInline: "the connection form's address refusal line" });
  const auth = dialAuth(keyValue, heldCredentialId);
  // An endpoint needs its URL (its key is optional); a hosted list needs the key it is read under.
  const ready = !credentialUnavailable && (baseUrl === null ? Object.keys(auth).length > 0 : baseUrl.trim() !== "");

  const forDraft = draftKeyOf({ providerId, baseUrl: baseUrl ?? "", key: keyValue, credentialId: heldCredentialId });

  const runCheck = (): void => {
    if (!ready) {
      return;
    }
    onListing({ forDraft, source: { status: "loading" } });
    void list
      .mutateAsync({ providerId, ...(baseUrl === null ? {} : { baseUrl: baseUrl.trim() }), ...auth })
      .then((result): void => onListing({ forDraft, source: modelListSource(result, runCheck) }))
      .catch((err: unknown): void => {
        onListing({ forDraft, source: failedCatalogSource(err, runCheck) });
        if (URL_REFUSAL_CODES.has(trpcErrorReason(err))) {
          onUrlRefusal(err);
        }
      })
      // The answer now lives in the listing; drop the mutation's retained variables, which carry the draft key.
      .finally(list.clearError);
  };

  const hosted = baseUrl === null;
  const listNow = useEffectEvent(runCheck);
  useEffect(() => {
    if (!(hosted && listsOnInput && ready)) {
      return;
    }
    // A pasted key waits for the typing to stop; a chosen saved key is one deliberate act.
    const settle = dialAuth(keyValue, heldCredentialId).key === undefined ? 0 : KEY_LIST_SETTLE_MS;
    const timer = setTimeout(() => {
      listNow();
    }, settle);
    return (): void => clearTimeout(timer);
  }, [hosted, listsOnInput, ready, keyValue, heldCredentialId]);

  if (hosted) {
    return null;
  }
  return (
    <Row align="center" gap="field">
      <Button disabled={!ready} variant="outline" loading={list.isPending} onClick={runCheck} size="sm">
        {LIST_MODELS_NAME}
      </Button>
    </Row>
  );
}

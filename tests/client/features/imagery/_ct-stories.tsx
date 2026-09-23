// CT stories for the imagery flow. Each story SEEDS the imagery-store
// (openImagine / openImageDetail / openImageEdit) in an effect, then renders a MINI-HOST that picks the modal
// body off `useOpenModal()` — the same body-swap the real shell ModalHost does — under CtDataProviders (the
// query + tRPC providers). So the flow runs through the real store + mutation factories over the routeTrpc-
// stubbed network, and the detail→edit→detail HAND-OFF (which drives openModal) is visible without mounting
// the whole app-shell. Ids + the blob url ride in as PROPS (minted node-side in the test, serialized to the
// page) so recorded tRPC inputs assert against the exact values used. Components only (the _ct-stories rule).

import { ImageDetailBody, ImageEditBody, ImagineBody } from "@orb/client/features/imagery";
import { openImageDetail, openImageEdit, openImagine, useOpenModal } from "@orb/client/state";
import type { AssetId, ChatId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import { useEffect } from "react";
import { CtAppDataProviders, CtDataProviders } from "../../../support/browser/ct-data-providers.tsx";
import { CtToastSurface } from "../../lib/_ct-stories.tsx";

/** The shell ModalHost's body-swap, narrowed to the three imagery slots — renders whichever the store says is
 *  open (null before the seed effect runs; the CT barriers on the settled body). */
function ImageryHost(): ReactElement | null {
  const openModal = useOpenModal();
  if (openModal === "imagine") {
    return <ImagineBody />;
  }
  if (openModal === "imageDetail") {
    return <ImageDetailBody />;
  }
  if (openModal === "imageEdit") {
    return <ImageEditBody />;
  }
  return null;
}

/** The imagine modal seeded in FREE mode with an explicit prompt — the fast path. */
export function ImagineFreeStory({ chatId }: { readonly chatId: ChatId }): ReactElement {
  useEffect(() => {
    openImagine({ chatId, mode: "free", prompt: "a dragon over the castle" });
  }, [chatId]);
  return (
    <CtDataProviders>
      <ImageryHost />
    </CtDataProviders>
  );
}

/** The imagine modal seeded in an EXTRACTION mode with no prompt — exercises the extractPrompt preview. */
export function ImagineExtractStory({ chatId }: { readonly chatId: ChatId }): ReactElement {
  useEffect(() => {
    openImagine({ chatId, mode: "scenario", prompt: "" });
  }, [chatId]);
  return (
    <CtDataProviders>
      <ImageryHost />
    </CtDataProviders>
  );
}

/** The image detail lightbox seeded on a room image — provenance strip + Edit (→ the edit body) + Set-as-
 *  background. The mini-host swaps to the edit body when the Edit action drives openModal. */
export function DetailFlowStory({ chatId, assetId, url }: { readonly chatId: ChatId; readonly assetId: AssetId; readonly url: string }): ReactElement {
  useEffect(() => {
    openImageDetail({ assetId, chatId, url, alt: "a generated image" });
  }, [assetId, chatId, url]);
  return (
    <CtDataProviders>
      <ImageryHost />
    </CtDataProviders>
  );
}

/** The detail lightbox on the REAL app QueryClient + the production toast outlet — the ONE stack in which a
 *  mutation's `meta.errorToast` and the body's own `toast.add` land on the SAME manager. That is what makes
 *  "exactly one toast, and it is the true one" (#623 P1) assertable: on the plain `CtDataProviders` client
 *  the error channel does not exist at all, so a double-toast defect would be invisible. */
export function DetailToastStory({ chatId, assetId, url }: { readonly chatId: ChatId; readonly assetId: AssetId; readonly url: string }): ReactElement {
  useEffect(() => {
    openImageDetail({ assetId, chatId, url, alt: "a generated image" });
  }, [assetId, chatId, url]);
  return (
    <CtAppDataProviders>
      <CtToastSurface>
        <ImageryHost />
      </CtToastSurface>
    </CtAppDataProviders>
  );
}

/** The image edit modal seeded on a source image — instruction + editImage; on success it hands off to the
 *  detail body on the freshly-edited asset (the mini-host swaps back to detail). */
export function EditFlowStory({ chatId, assetId, url }: { readonly chatId: ChatId; readonly assetId: AssetId; readonly url: string }): ReactElement {
  useEffect(() => {
    openImageEdit({ assetId, chatId, url, alt: "a generated image" });
  }, [assetId, chatId, url]);
  return (
    <CtDataProviders>
      <ImageryHost />
    </CtDataProviders>
  );
}

/** The edit modal on the REAL app QueryClient + the production toast outlet — the twin of `DetailToastStory`
 *  for the edit surface. It is the ONE stack in which a post-success resolve FAILURE can be observed: the
 *  edit succeeds server-side but `resolveBlobRefs` rejects, and the body must surface the partial-success
 *  toast (#702) rather than swallow it. On the plain `CtDataProviders` client there is no toast outlet, so a
 *  silent-swallow defect would be invisible. */
export function EditToastStory({ chatId, assetId, url }: { readonly chatId: ChatId; readonly assetId: AssetId; readonly url: string }): ReactElement {
  useEffect(() => {
    openImageEdit({ assetId, chatId, url, alt: "a generated image" });
  }, [assetId, chatId, url]);
  return (
    <CtAppDataProviders>
      <CtToastSurface>
        <ImageryHost />
      </CtToastSurface>
    </CtAppDataProviders>
  );
}

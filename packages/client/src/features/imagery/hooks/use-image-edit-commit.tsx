// The `imageEdit` modal's COMMIT — img2img over an OWNED asset. The source
// image, an instruction, and Generate edit (the submit ModalHost draws) → `imagery.editImage` (which does NOT post to chat — that stays
// `generateImage`). On success the edited image is a fresh owned asset with its own provenance (edited:true),
// so the modal HANDS OFF to the detail lightbox on that new asset — the loop closes: the host previews the
// edit, reads its provenance, sets it as the background, or edits again, all through the ONE detail surface.
// The model's soft `image_edit_dropped` warning (its connection can't img2img, so it re-generated instead) is
// surfaced, never swallowed; a hard capability refusal throws and rides the mutation's errorToast.
//
// THE INSTRUCTION BELONGS TO ONE SUBJECT: a new subject replaces it during render, and an absent subject (the close
// clears it first) renders the rest line with the submit off.

import type { AssetBlobRef } from "@orb/contracts/assets";
import { blobUrl } from "@orb/contracts/assets";
import type { AssetId, ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { ArrowLeft, Icon } from "@orb/ui/icons";
import { Section, Stack } from "@orb/ui/layout";
import { MessageMedia } from "@orb/ui/message-media";
import { Text } from "@orb/ui/text";
import { Textarea } from "@orb/ui/textarea";
import { useToastManager } from "@orb/ui/toast";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { useInvalidation, useTRPC } from "#data";
import { useFocusOnSwap } from "#lib";
import type { ImageSubject, ModalCommit } from "#state";
import { openImageDetail, useEditSubject } from "#state";
import { IMAGE_EDIT_BACK_NAME, IMAGE_EDIT_EMPTY_TEXT, IMAGE_EDIT_INSTRUCTION_NAME, imageEditGenerateLabel } from "../lib/imagine-names.ts";
import { useEditImage } from "./use-imagery-mutations.ts";

const INSTRUCTION_ROWS = 2;
const INSTRUCTION_MAX_ROWS = 6;

/**
 * The detail subject for the freshly-edited asset — the hand-off mints a BRAND-NEW subject (a different
 * asset than the one being edited), so every field comes off the resolver row we already fetched for its
 * url; nothing else on this surface knows the edited image's shape.
 *
 * #654: `dims` is what makes the landing modal RESERVE the image's true box instead of collapsing to 0×0
 * and reflowing when the bytes land. Both dimensions or neither — a half-known header reserves nothing, so
 * it takes the primitive's placeholder aspect, and so does an asset with no stored size at all.
 */
function editedSubject(ref: AssetBlobRef, assetId: AssetId, chatId: ChatId): ImageSubject {
  const dims = ref.width === null || ref.height === null ? undefined : { w: ref.width, h: ref.height };
  return { assetId, chatId, url: blobUrl(ref.hash), alt: "Edited image", ...(dims === undefined ? {} : { dims }) };
}

export function useImageEditCommit(): ModalCommit {
  const subject = useEditSubject();
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const queryClient = useQueryClient();
  const toast = useToastManager();
  const editImage = useEditImage({ trpc, invalidation });
  const [draft, setDraft] = useState({ assetId: subject?.assetId, instruction: "" });
  if (draft.assetId !== subject?.assetId) {
    setDraft({ assetId: subject?.assetId, instruction: "" });
  }
  // The person pressed Edit to say what should change, so the instruction is where they land.
  const instructionRef = useRef<HTMLTextAreaElement>(null);
  useFocusOnSwap(instructionRef);

  const trimmed = draft.instruction.trim();

  const runEdit = (): void => {
    if (subject === undefined || trimmed.length === 0) {
      return;
    }
    void editImage
      .mutateAsync({ sourceAssetId: subject.assetId, instruction: trimmed, chatId: subject.chatId })
      .then(async (result) => {
        for (const warning of result.warnings) {
          toast.add({ title: "Image edited with a caveat", description: warning.detail });
        }
        const first = result.images[0];
        if (first === undefined) {
          toast.add({ title: "The edit produced no image." });
          return;
        }
        // Resolve the new asset's blob url (owner-scoped) so the detail lightbox can paint it, then hand off.
        // The RESOLVE is a DISTINCT failure from the edit and must not fall into the outer catch: the asset is
        // already minted and owned server-side, so a REJECTED resolve (a transient drop in the window right
        // after a long generation) means "saved but not openable here", not "edit failed". Swallowing it left
        // the modal unchanged with no toast, so the host reads a successful edit as a failure and pays for a
        // duplicate — the file header's "surfaced, never swallowed" law. Surface it as the same partial success
        // the empty-row arm below carries; the outer catch keeps covering only the mutation-rejection arm the
        // global errorToast already speaks for.
        let refs: readonly AssetBlobRef[];
        // the comment above explains — this catch
        // explicitly toasts a dedicated "saved but not openable" message before returning. Ends if that toast
        // call is removed.
        try {
          refs = await queryClient.query(trpc.assets.resolveBlobRefs.queryOptions({ assetIds: [first.assetId] }));
        } catch {
          toast.add({ title: "Edited image saved", description: "Couldn't open it here. It's in your gallery." });
          return;
        }
        const ref = refs[0];
        if (ref === undefined) {
          toast.add({ title: "Edited image saved", description: "It's in your gallery." });
          return;
        }
        openImageDetail(editedSubject(ref, first.assetId, subject.chatId));
      })
      .catch(() => undefined);
  };

  return {
    submit: {
      label: imageEditGenerateLabel(editImage.isPending),
      disabled: subject === undefined || trimmed.length === 0,
      loading: editImage.isPending,
      onSubmit: runEdit,
    },
    // BACK is not decoration — `openImageEdit` clears `detailSubject` (imagery-store), so Escape from here
    // dumps the viewer to the room instead of to the image they were looking at. Re-opening the detail on
    // the SAME subject is the return leg. Disabled mid-edit: leaving the surface that owns the in-flight result
    // would strand it.
    footerLead:
      subject === undefined ? undefined : (
        <Button disabled={editImage.isPending} variant="ghost" onClick={(): void => openImageDetail(subject)} type="button">
          <Icon icon={ArrowLeft} size="sm" />
          {IMAGE_EDIT_BACK_NAME}
        </Button>
      ),
    content:
      subject === undefined ? (
        <Text voice="gloss">{IMAGE_EDIT_EMPTY_TEXT}</Text>
      ) : (
        <>
          <Section kicker="Source">
            {/* The subject's stored dims reserve the true box, so the source image is already the right
                shape when the modal opens rather than snapping into place as it decodes. */}
            <MessageMedia
              src={{ kind: "asset", url: subject.url }}
              media="image"
              alt={subject.alt}
              {...(subject.dims === undefined ? {} : { dims: subject.dims })}
              centred={true}
            />
          </Section>
          <Stack gap="field">
            <Text as="span" voice="label">
              How should it change?
            </Text>
            <Textarea
              aria-label={IMAGE_EDIT_INSTRUCTION_NAME}
              maxRows={INSTRUCTION_MAX_ROWS}
              ref={instructionRef}
              onValueChange={(value): void => setDraft((current) => ({ ...current, instruction: value }))}
              placeholder="e.g. make it night, add falling snow, turn the coat red…"
              rows={INSTRUCTION_ROWS}
              value={draft.instruction}
            />
          </Stack>
        </>
      ),
  };
}

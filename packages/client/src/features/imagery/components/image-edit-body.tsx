// The `imageEdit` modal body (interaction-direction-spec.md §7 B5) — img2img over an OWNED asset. The source
// image, an instruction, and Generate → `imagery.editImage` (which does NOT post to chat — that stays
// `generateImage`). On success the edited image is a fresh owned asset with its own provenance (edited:true),
// so the modal HANDS OFF to the detail lightbox on that new asset — the loop closes: the host previews the
// edit, reads its provenance, sets it as the background, or edits again, all through the ONE detail surface.
// The model's soft `image_edit_dropped` warning (its connection can't img2img, so it re-generated instead) is
// surfaced, never swallowed; a hard capability refusal throws and rides the mutation's errorToast.

import { blobUrl } from "@orb/contracts/assets";
import { Button } from "@orb/ui/button";
import { ArrowLeft, Icon, WandSparkles } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { MessageMedia } from "@orb/ui/message-media";
import { Text } from "@orb/ui/text";
import { Textarea } from "@orb/ui/textarea";
import { useToastManager } from "@orb/ui/toast";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { useInvalidation, useTRPC } from "#data";
import type { ImageSubject } from "#state";
import { openImageDetail, useEditSubject } from "#state";
import { useEditImage } from "../hooks/use-imagery-mutations.ts";

const INSTRUCTION_ROWS = 2;
const INSTRUCTION_MAX_ROWS = 6;

export function ImageEditBody(): ReactElement {
  const subject = useEditSubject();
  if (subject === undefined) {
    return (
      <Stack gap="block" padding="block">
        <Text voice="gloss">No image to edit.</Text>
      </Stack>
    );
  }
  return <ImageEdit key={subject.assetId} subject={subject} />;
}

function ImageEdit({ subject }: { readonly subject: ImageSubject }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const queryClient = useQueryClient();
  const toast = useToastManager();
  const editImage = useEditImage({ trpc, invalidation });
  const [instruction, setInstruction] = useState("");

  const trimmed = instruction.trim();
  const canEdit = trimmed.length > 0 && !editImage.isPending;

  const runEdit = (): void => {
    if (!canEdit) {
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
        const refs = await queryClient.fetchQuery(trpc.assets.resolveBlobRefs.queryOptions({ assetIds: [first.assetId] }));
        const ref = refs[0];
        if (ref === undefined) {
          toast.add({ title: "Edited image saved", description: "It's in your gallery." });
          return;
        }
        openImageDetail({ assetId: first.assetId, chatId: subject.chatId, url: blobUrl(ref.hash), alt: "Edited image" });
      })
      .catch(() => undefined);
  };

  return (
    <Stack gap="block" padding="block">
      <Section kicker="Source">
        <MessageMedia src={{ kind: "asset", url: subject.url }} media="image" alt={subject.alt} className="mx-auto" />
      </Section>
      <Stack gap="field">
        <Text as="span" voice="label">
          How should it change?
        </Text>
        <Textarea
          aria-label="Edit instruction"
          maxRows={INSTRUCTION_MAX_ROWS}
          onValueChange={(value): void => setInstruction(value)}
          placeholder="e.g. make it night, add falling snow, turn the coat red…"
          rows={INSTRUCTION_ROWS}
          value={instruction}
        />
      </Stack>
      {/* BACK is not decoration — `openImageEdit` clears `detailSubject` (imagery-store), so Escape from here
          dumps the viewer to the room instead of to the image they were looking at. Re-opening the detail on
          the SAME subject is the return leg (#623 P2: the detail→edit door used to be one-way). Disabled
          mid-edit: leaving the surface that owns the in-flight result would strand it. */}
      <Row className="flex-wrap" gap="field" justify="between">
        <Button disabled={editImage.isPending} intent="ghost" onClick={(): void => openImageDetail(subject)} type="button">
          <Icon icon={ArrowLeft} size="sm" />
          Back to the image
        </Button>
        <Button disabled={!canEdit} intent="primary" onClick={runEdit} type="button">
          <Icon icon={WandSparkles} size="sm" />
          {editImage.isPending ? "Editing…" : "Generate edit"}
        </Button>
      </Row>
    </Stack>
  );
}

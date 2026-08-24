// The `imageDetail` modal body (interaction-direction-spec.md §7 B5) — the lightbox: the image large, its
// provenance strip, and the two content shortcuts (Edit → the img2img modal; Set as background → the D63
// carried-background applier). The image renders through the `@orb/ui/message-media` primitive (own-origin
// asset, always allowed), never a hand-rolled <img>. Set-as-background resolves the asset's hash/mime via
// the OWNER-scoped `assets.resolveBlobRefs` (the host owns the room's images) and writes the ONE background
// applier (`chat.setChatBackground`) — never a forked second path — against the chatId PINNED into the
// subject at open time (a room image lives in the open room; the pin survives later navigation).

import { Button } from "@orb/ui/button";
import { Icon, Images, Pencil } from "@orb/ui/icons";
import { Row, Section, Stack } from "@orb/ui/layout";
import { MessageMedia } from "@orb/ui/message-media";
import { Text } from "@orb/ui/text";
import { useToastManager } from "@orb/ui/toast";
import { useQueryClient } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useState } from "react";
import { useInvalidation, useTRPC } from "#data";
import type { ImageSubject } from "#state";
import { openImageEdit, useDetailSubject } from "#state";
import { useSetChatBackground } from "../hooks/use-imagery-mutations.ts";
import { ProvenanceStrip } from "./provenance-strip.tsx";

export function ImageDetailBody(): ReactElement {
  const subject = useDetailSubject();
  if (subject === undefined) {
    return (
      <Stack gap="block" padding="block">
        <Text voice="gloss">No image selected.</Text>
      </Stack>
    );
  }
  return <ImageDetail subject={subject} />;
}

function ImageDetail({ subject }: { readonly subject: ImageSubject }): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const queryClient = useQueryClient();
  const toast = useToastManager();
  const setBackground = useSetChatBackground({ trpc, invalidation });
  const [resolvingBackground, setResolvingBackground] = useState(false);
  const settingBackground = resolvingBackground || setBackground.isPending;

  const onSetBackground = (): void => {
    setResolvingBackground(true);
    // The background wire needs the asset's HASH + mime (the URL resolver builds `blobUrl(hash)`); the
    // owner-scoped resolver returns them for an image the host owns, absent otherwise (never a leak).
    void queryClient
      .fetchQuery(trpc.assets.resolveBlobRefs.queryOptions({ assetIds: [subject.assetId] }))
      .then((refs) => {
        const ref = refs[0];
        if (ref === undefined) {
          toast.add({ title: "Couldn't set the background", description: "This image is no longer available to you." });
          return;
        }
        setBackground.mutate({ chatId: subject.chatId, background: { kind: "asset", assetId: subject.assetId, assetHash: ref.hash, mime: ref.mime } });
        toast.add({ title: "Set as chat background" });
      })
      .catch(() => toast.add({ title: "Couldn't set the background" }))
      .finally(() => setResolvingBackground(false));
  };

  return (
    <Stack gap="block" padding="block">
      <MessageMedia src={{ kind: "asset", url: subject.url }} media="image" alt={subject.alt} className="mx-auto" />
      <Section kicker="Details">
        <ProvenanceStrip assetId={subject.assetId} />
      </Section>
      <Row className="flex-wrap" gap="field" justify="end">
        <Button intent="ghost" onClick={(): void => openImageEdit(subject)} type="button">
          <Icon icon={Pencil} size="sm" />
          Edit image
        </Button>
        <Button disabled={settingBackground} intent="primary" onClick={onSetBackground} type="button">
          <Icon icon={Images} size="sm" />
          {settingBackground ? "Setting…" : "Set as background"}
        </Button>
      </Row>
    </Stack>
  );
}

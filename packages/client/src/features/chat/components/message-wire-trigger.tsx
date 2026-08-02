// RAWVIEW — the metadata row's HOST-only "wire" arm: a quiet trigger that opens the per-variant wire
// inspector for THIS row's shown swipe (`VariantWireViewer`). Mirrors `MessageCostReadout` exactly — the
// same quiet micro-mono voice (D66 P5), the same "the query fires only on the click" posture (the dialog's
// read is `enabled: open`, so an unopened row costs nothing).
//
// The HOST gate lives in the CALLER (`MessageMetadataRow`, on `viewerIsHost`) — one gate, one place, and it
// is UX only: the server verb is `requireHost`. Rendering nothing for a member also keeps the affordance from
// advertising a plane they cannot have.
//
// Renders nothing on a row whose shown swipe cannot have a prompt: a `user` row is authored, never generated
// (its variant's `promptSnapshot` is null by construction). `system` room notices are the same. Absence here
// is a real answer, not a hidden feature — the assistant rows that DID generate are exactly the ones a host
// asks "what did this send?" about.

import type { MessageView } from "@orb/contracts/chat";
import { Button } from "@orb/ui/button";
import { Code, Icon } from "@orb/ui/icons";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useState } from "react";
import { testId } from "#lib";
import { VariantWireViewer } from "./variant-wire-viewer";

export function MessageWireTrigger({ message }: { readonly message: MessageView }): ReactElement | null {
  const [open, setOpen] = useState(false);

  if (message.role !== "assistant") {
    return null;
  }

  return (
    <>
      <Button
        type="button"
        intent="ghost"
        size="sm"
        aria-label="Show what this reply sent"
        onClick={(): void => setOpen(true)}
        data-testid={testId("variantWireTrigger")}
        data-slot="message-metadata-wire-trigger"
      >
        <Icon icon={Code} size="xs" />
        <Text voice="gloss" className="font-mono">
          wire
        </Text>
      </Button>
      {/* Mounted only once opened — an unopened row builds no query key and no dialog subtree. */}
      {open ? <VariantWireViewer chatId={message.chatId} variantId={message.selectedVariantId} open={open} onOpenChange={setOpen} /> : null}
    </>
  );
}

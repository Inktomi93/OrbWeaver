import { CtDataProviders } from "@orb/testkit/browser/ct-data-providers.tsx";
import type { ReactElement } from "react";
import { ChatAttachmentQualitySection } from "#client/features/chat/components/chat-attachment-quality-section.tsx";

export function AttachmentQualityStory({ width = 320 }: { readonly width?: number }): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width }}>
        <ChatAttachmentQualitySection sectionId="chat-attachment-quality" />
      </div>
    </CtDataProviders>
  );
}

import type { ReactElement } from "react";
import { ChatAttachmentQualitySection } from "../../../../packages/client/src/features/chat/components/chat-attachment-quality-section.tsx";
import { CtDataProviders } from "../../../support/browser/ct-data-providers.tsx";

export function AttachmentQualityStory({ width = 320 }: { readonly width?: number }): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width }}>
        <ChatAttachmentQualitySection sectionId="chat-attachment-quality" />
      </div>
    </CtDataProviders>
  );
}

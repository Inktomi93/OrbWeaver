import { CtConfigGroupBody, CtDataProviders } from "@orb/testkit/browser/ct-data-providers.tsx";
import { configSections } from "@orb/testkit/browser/ct-door.ts";
import { isolationRegistry } from "@orb/testkit/browser/ct-isolation.ts";
import type { ReactElement } from "react";

const chatAttachmentQualitySectionRegistry = isolationRegistry(
  "config-sections",
  "isolates chat-attachment-quality from sibling settings sections while retaining its production contribution and anchor",
  [configSections.get("chat-attachment-quality")],
);

export function AttachmentQualityStory({ width = 320 }: { readonly width?: number }): ReactElement {
  return (
    <CtDataProviders>
      <div style={{ width }}>
        <CtConfigGroupBody anchor="chat-behavior" sections={chatAttachmentQualitySectionRegistry} />
      </div>
    </CtDataProviders>
  );
}

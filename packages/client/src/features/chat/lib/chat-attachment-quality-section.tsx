import type { ConfigSectionContribution } from "#state";
import { ChatAttachmentQualitySection } from "../components/chat-attachment-quality-section.tsx";
import { ATTACHMENT_QUALITY_KEYS, ATTACHMENT_QUALITY_SUBCATEGORY } from "./chat-attachment-quality-model.ts";

const SECTION_ID = "chat-attachment-quality";
export const chatAttachmentQualitySection: ConfigSectionContribution = {
  id: SECTION_ID,
  anchor: "chat-behavior",
  nav: ATTACHMENT_QUALITY_SUBCATEGORY,
  owns: { tier: "user", section: "chat", keys: ATTACHMENT_QUALITY_KEYS },
  body: () => <ChatAttachmentQualitySection sectionId={SECTION_ID} />,
};

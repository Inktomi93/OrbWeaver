// The Image-prompts settings-SECTION CONTRIBUTION (Phase B ⑫ / client-architecture-lockdown.md §6c) — the
// co-located definition the chat feature exports on its front door; the composition root (main.tsx) assembles
// it into the chat-behavior pane's settings-section registry (G8) at the `chat-behavior` anchor. Chat owns
// imagery consumption (the quiet-extraction shaper + the /imagine composer), so it lands here — never
// features/settings (the databank-settings-section precedent).

import type { SettingsSectionContribution } from "#state";
import { ImageryTemplatesSection } from "../components/imagery-templates-section";
import { IMAGERY_TEMPLATES_SUBCATEGORY } from "./imagery-templates-section-nav";

export const imageryTemplatesSection: SettingsSectionContribution = {
  id: "chat-imagery-templates",
  anchor: "chat-behavior",
  nav: IMAGERY_TEMPLATES_SUBCATEGORY,
  body: () => <ImageryTemplatesSection />,
};

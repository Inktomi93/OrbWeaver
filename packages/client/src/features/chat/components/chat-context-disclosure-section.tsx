// The This-chat tab's DISCLOSURE SECTION — a `Section kicker` whose heading is a `CollapsibleTrigger`, with
// the open posture remembered per host per section (`chat-context-section-open-store.ts`). Extracted from
// settings-context-tab.tsx at the `component-size` cap (#885 lane); the OPEN/CLOSED default LAW — which
// sections open by default and why — stays with the tab that declares them, beside its constants.

import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "@orb/ui/collapsible";
import { Section } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement, ReactNode } from "react";
import { setChatContextSectionOpen, useChatContextSectionOpen } from "#state";

interface DisclosureSectionProps {
  /** The disclosure's STABLE key in the remembered-posture store — never the visible label, so a copy edit
   *  cannot silently forget a host's posture. Grafted sections carry a `graft:` prefix so a contribution can
   *  never collide with one of this file's own ids. */
  readonly sectionId: string;
  readonly kicker: ReactNode;
  /** Expanded until this host answers for this section (`chat-context-section-open-store.ts`). */
  readonly defaultOpen: boolean;
  /** Keep the body in the DOM (hidden) while closed. Needed by the SILENT-CONTRIBUTOR COLLAPSE: the
   *  `has-[…:empty]:hidden` selector below asks whether the graft's wrapper has element children, and an
   *  unmounted wrapper answers "no wrapper", which would spend a kicker on a contributor that renders
   *  nothing — the exact orphan heading that collapse exists to prevent. */
  readonly keepMounted?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}

export function DisclosureSection({ sectionId, kicker, defaultOpen, keepMounted = false, className, children }: DisclosureSectionProps): ReactElement {
  const open = useChatContextSectionOpen(sectionId, defaultOpen);
  return (
    <Collapsible
      open={open}
      onOpenChange={(next: boolean): void => {
        setChatContextSectionOpen(sectionId, next);
      }}
    >
      <Section
        className={className}
        kicker={
          <CollapsibleTrigger size="control">
            <Text as="span" voice="interactiveKicker">
              {kicker}
            </Text>
          </CollapsibleTrigger>
        }
      >
        {/* `text-foreground` restores what the pane's body inherited before this wrapper existed — the
            primitive's panel is spelled for a disclosure holding running PROSE (`text-muted-foreground`),
            and a section body is controls. */}
        <CollapsiblePanel className="text-foreground" keepMounted={keepMounted}>
          {children}
        </CollapsiblePanel>
      </Section>
    </Collapsible>
  );
}

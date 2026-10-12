import { pluginChatSettingsSection } from "@orb/client/features/plugin";
import type { ChatSettingsSectionContribution } from "@orb/client/lib";
import { __resetChatContextSections } from "@orb/client/state";
import type { ChatId } from "@orb/kit/ids";
import { CtDataProviders } from "@orb/testkit/browser/ct-data-providers.tsx";
import { isolationRegistry } from "@orb/testkit/browser/ct-isolation.ts";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { CommittedSettingsTab } from "#client/features/chat/components/settings-context-tab.tsx";

const sections = isolationRegistry<ChatSettingsSectionContribution>(
  "host-truth",
  "pairs the plugin panel section with one unrelated host-controls section so the host band shows only what a host-gated contribution declares",
  [
    pluginChatSettingsSection,
    { id: "unrelated", anchor: "host-controls", kicker: "Unrelated rules", body: (): ReactElement => <button type="button">Unrelated action</button> },
  ],
);

export function HostControlTruthStory({ chatId, isHost = true }: { readonly chatId: ChatId; readonly isHost?: boolean }): ReactElement {
  const [mounted, setMounted] = useState(true);
  useEffect(() => {
    __resetChatContextSections();
    return __resetChatContextSections;
  }, []);
  return (
    <CtDataProviders>
      <button type="button" onClick={(): void => setMounted(!mounted)}>
        Toggle tab mount
      </button>
      <div style={{ width: 360, height: 1000, overflowY: "auto" }}>
        {mounted ? <CommittedSettingsTab chatId={chatId} roomOverrides={{}} isHost={isHost} background={null} showGroup={false} sections={sections} /> : null}
      </div>
    </CtDataProviders>
  );
}

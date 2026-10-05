import { pluginChatSettingsSection } from "@orb/client/features/plugin";
import type { ChatSettingsSectionContribution } from "@orb/client/lib";
import { createContributorRegistry } from "@orb/client/lib";
import { __resetChatContextSections } from "@orb/client/state";
import type { ChatId } from "@orb/kit/ids";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";
import { CommittedSettingsTab } from "../../../../../packages/client/src/features/chat/components/settings-context-tab.tsx";
import { CtDataProviders } from "../../../../support/browser/ct-data-providers.tsx";

const sections = createContributorRegistry<ChatSettingsSectionContribution>("host-truth", [
  pluginChatSettingsSection,
  { id: "unrelated", anchor: "host-controls", kicker: "Unrelated rules", body: (): ReactElement => <button type="button">Unrelated action</button> },
]);

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

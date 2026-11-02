import { presetsSection } from "@orb/client/features/preset";
import { selectChatFromList, selectPresetFromList, setPresetEditorView } from "@orb/client/state";
import type { ChatId, PresetId } from "@orb/kit/ids";
import { CtClientProviders } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useLayoutEffect } from "react";

interface PresetReadoutStoryProps {
  /** The preset the Presets list opened; `null` leaves nothing selected, which is the active-preset readout. */
  readonly presetId: PresetId | null;
  /** The editor view the readout projects, by its id in `PRESET_EDITOR_VIEWS`. */
  readonly view: string;
  /** The open room the readout binds to, or `null` for the chat-free floor. */
  readonly chatId: ChatId | null;
}

function ReadoutSelection({ presetId, view, chatId }: PresetReadoutStoryProps): ReactElement {
  useLayoutEffect(() => {
    if (presetId !== null) {
      selectPresetFromList(presetId);
    }
    setPresetEditorView(view);
    if (chatId !== null) {
      selectChatFromList(chatId);
    }
  }, [presetId, view, chatId]);
  const { context } = presetsSection;
  if (context.kind !== "single") {
    throw new Error("The Presets section must provide a single readout pane");
  }
  return <Container>{context.body()}</Container>;
}

/** The production Presets readout pane, opened the way the library and the editor tab strip open it. */
export function PresetReadoutStory(props: PresetReadoutStoryProps): ReactElement {
  return (
    <CtClientProviders>
      <ReadoutSelection {...props} />
    </CtClientProviders>
  );
}

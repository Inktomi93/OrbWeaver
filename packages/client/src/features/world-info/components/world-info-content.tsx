// The World Info CONTENT body — a selected book opens its editor; nothing selected shows the teaching
// welcome. Reads its OWN selection from #state so the section definition composing it stays a pure data
// object.

import type { ReactElement } from "react";
import { useSelectedWorldBookId } from "#state";
import { WorldInfoEditorSurface } from "../surfaces/world-info-editor-surface";
import { WorldInfoWelcome } from "./world-info-welcome";

export function WorldInfoContent(): ReactElement {
  const selectedWorldBookId = useSelectedWorldBookId();
  if (selectedWorldBookId === null) {
    return <WorldInfoWelcome />;
  }
  return <WorldInfoEditorSurface bookId={selectedWorldBookId} />;
}

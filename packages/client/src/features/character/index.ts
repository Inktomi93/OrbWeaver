// character/ front door — the only entry into the character slice. The composition root enters through
// `makeCharactersSection`, which mounts the library anchor and browse surface in LIST and, in CONTENT,
// `CharacterEditorSurface` when a character is selected, else the library welcome.
export {} from "./anchors/character-library-anchor.tsx";
export {} from "./components/character-actions-menu.tsx";
export {} from "./components/character-appearance-tab.tsx";
export {} from "./components/character-bulk-bar.tsx";

export {} from "./components/character-facet-editor.tsx";

export {} from "./components/character-facet-inspector.tsx";

export {} from "./components/character-hero-band.tsx";

export {} from "./components/character-library-welcome.tsx";

export {} from "./components/character-relations-tab.tsx";

export {} from "./components/character-trust-tab.tsx";
export { characterCreateChrome } from "./lib/character-create-chrome.tsx";

export {} from "./lib/character-list-view.ts";

export { characterSlashCommands } from "./lib/character-slash-commands.ts";
export { makeCharactersSection } from "./lib/characters-section.tsx";
export { librarySettingsSection } from "./lib/library-settings-section.tsx";
export { CharacterEditorSurface } from "./surfaces/character-editor-surface.tsx";
export {} from "./surfaces/character-library-surface.tsx";

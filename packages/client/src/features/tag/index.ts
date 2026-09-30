// features/tag — front door (UI-Arch §2.1). The tag slice owns the ONE tag-management surface and contributes
// it to the Corpus workspace as the Labels mode (D271). Tags label characters, chats, world books, personas and
// presets, so no other feature is their reader.

export { labelsContextTabs, labelsCorpusMode } from "./lib/labels-mode.tsx";

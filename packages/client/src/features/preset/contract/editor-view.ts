// Client-owned projections derive their production wire/input homes; computed presentation data stays local.

export type PresetEditorView = Readonly<Pick<(typeof PRESET_EDITOR_VIEW_TUPLE)[number], "id"> & { label: string }>;

export const PRESET_EDITOR_VIEW_TUPLE = [
  { id: "params", label: "Params" },
  { id: "prompt", label: "Prompt" },
  { id: "actions", label: "Actions" },
  { id: "data", label: "Data" },
  { id: "transforms", label: "Transforms" },
] as const;

export type PresetEditorViewId = (typeof PRESET_EDITOR_VIEW_TUPLE)[number]["id"];

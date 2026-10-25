// components/ front door — client-shared composites over @orb/ui (UI-Arch §2.1: NOT @orb/ui itself —
// ui stays parts-only; these are cross-feature composites with no single feature owner).
export { BackgroundSourceField } from "./background-source-field.tsx";
export type { BandProps } from "./band.tsx";
export { Band } from "./band.tsx";
export { CharacterPicker } from "./character-picker.tsx";
export { ConfirmDialog } from "./confirm-dialog.tsx";
export { useSetBinding, useUpdateConnection } from "./connection-role-mutations.ts";
export { ConnectionRoleSlot } from "./connection-role-slot.tsx";
export { CountText } from "./count-text.tsx";
export { DescribedMenuItem } from "./described-menu-item.tsx";
export { EditableTagChip } from "./editable-tag-chip.tsx";
export { useEmbedRefusalToastAfterUnmount } from "./embedder-refusal-toast.ts";
export { EntryListEditor } from "./entry-list-editor.tsx";
export { FaceStrip } from "./face-strip.tsx";
export { FlowDialog } from "./flow-dialog.tsx";
export { FormDialog, FormSubmitButton } from "./form-dialog.tsx";
export { ImportedChatsMemoryOffer } from "./imported-chats-memory-offer.tsx";
export { LibraryRow } from "./library-row.tsx";
export { LibraryListFrame, LibraryListLayout, LibraryListRows, LibrarySurfaceShell } from "./library-surface.tsx";
export {} from "./list-pane-header.tsx";
export { ListPaneHeaderHost } from "./list-pane-header-host.tsx";
export { ListSearch } from "./list-search.tsx";
export type { MemberDrillBack } from "./member-drill-header.tsx";
export { MemberDrillHeader } from "./member-drill-header.tsx";
export type { ModelRunConfirmDialogProps } from "./model-run-confirm-dialog.tsx";
export { ModelRunConfirmDialog } from "./model-run-confirm-dialog.tsx";
export { PanelEdgeControl } from "./panel-edge-control.tsx";
export { PickerDialog } from "./picker-dialog.tsx";
export { REVEAL_AT_COARSE } from "./pointer-variants.ts";
export { QueryBoundary } from "./query-boundary.tsx";
export { RegexScopeOrder } from "./regex-scope-order.tsx";
export { RegexScriptPicker } from "./regex-script-picker.tsx";
export { useReindexConfirm } from "./reindex-confirm.tsx";
export type { RelationManagerItem } from "./relation-manager-section.tsx";
export { RelationManagerSection } from "./relation-manager-section.tsx";
export { RowActionsMenu } from "./row-actions-menu.tsx";
export { RowToggleAction } from "./row-toggle-action.tsx";
export {} from "./setting-row-actions.tsx";
export { SettingRowGroup } from "./setting-row-group.tsx";
export { SettingCheckboxRow, SettingSwitchRow } from "./setting-switch-row.tsx";
export { ConfigTeachScope, SettingRow } from "./setting-teach-row.tsx";
export { SettingTrackRow } from "./setting-track-row.tsx";
export { StoredConfigUnreadableNotice } from "./stored-config-unreadable-notice.tsx";
export { TagEditorBody } from "./tag-editor-body.tsx";
export {
  CREATE_TAG_CONFLICT_TOAST,
  isTagNameConflict,
  useAcceptSuggestion,
  useCreateTag,
  usePruneUnusedTags,
  useRejectSuggestion,
  useRemoveTag,
  useSetTagOrder,
} from "./tag-mutations.ts";
export { TagPickerDialog } from "./tag-picker-dialog.tsx";
export { Tip } from "./tip.tsx";
export { TrailingArrow } from "./trailing-arrow.tsx";
export type { ConfigLeafAddress, ConfigLeafValue } from "./use-config-leaf.ts";
export { configLeafKey, useConfigLeaf, useConfigLeafReadings } from "./use-config-leaf.ts";
export { useEmbedderRebuild } from "./use-embedder-rebuild.ts";
export { useFirstBootBox } from "./use-first-boot-box.ts";
export { useModelRunConfirm } from "./use-model-run-confirm.ts";
export { useRerankModel, useUtilityModel } from "./use-utility-model.ts";
export type { UserMacrosFormValues } from "./user-macro-editor-dialog.tsx";
export { UserMacroEditorDialog } from "./user-macro-editor-dialog.tsx";
export { RerankModelDoor, UtilityModelDoor } from "./utility-model-door.tsx";
export { ViewerDialog } from "./viewer-dialog.tsx";

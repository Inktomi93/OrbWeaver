// components/ front door — client-shared composites over @orb/ui (UI-Arch §2.1: NOT @orb/ui itself —
// ui stays parts-only; these are cross-feature composites with no single feature owner).
export { BackgroundSourceField } from "./background-source-field.tsx";
export type { BandProps } from "./band.tsx";
export { Band } from "./band.tsx";
export { CharacterPicker } from "./character-picker.tsx";
export { CollectionGrid } from "./collection-grid.tsx";
export { ConfirmDialog } from "./confirm-dialog.tsx";
export { useSetBinding, useUpdateConnection } from "./connection-role-mutations.ts";
export { ConnectionRoleSlot } from "./connection-role-slot.tsx";
export { CountText } from "./count-text.tsx";
export { DescribedMenuItem } from "./described-menu-item.tsx";
export { DetailHeader } from "./detail-header.tsx";
export { EditableTagChip } from "./editable-tag-chip.tsx";
export { EditorPage } from "./editor-page.tsx";
export { useEmbedRefusalToastAfterUnmount } from "./embedder-refusal-toast.ts";
export { EntryListEditor } from "./entry-list-editor.tsx";
export type { FaceStripItem } from "./face-strip.tsx";
export { FaceStrip } from "./face-strip.tsx";
export { FlowDialog } from "./flow-dialog.tsx";
export { FormDialog, FormSubmitButton } from "./form-dialog.tsx";
export { ImportedChatsMemoryOffer } from "./imported-chats-memory-offer.tsx";
export type { LibraryRowActions } from "./library-row.tsx";
export { LibraryRow } from "./library-row.tsx";
export { LibraryListRows, LibrarySurfaceShell } from "./library-surface.tsx";
export { ListPage } from "./list-page.tsx";
export {} from "./list-pane-header.tsx";
export { ListPaneHeaderHost } from "./list-pane-header-host.tsx";
export type { MemberDrillBack } from "./member-drill-header.tsx";
export { MemberDrillHeader } from "./member-drill-header.tsx";
export type { ModelRunConfirmDialogProps } from "./model-run-confirm-dialog.tsx";
export { ModelRunConfirmDialog } from "./model-run-confirm-dialog.tsx";
export type { OverflowAction } from "./overflow-actions.tsx";
export { OverflowActions, OverflowMenuForms, TRAIL_OVERFLOW_LABEL } from "./overflow-actions.tsx";
export { PanelEdgeControl } from "./panel-edge-control.tsx";
export { PickerDialog } from "./picker-dialog.tsx";
export { QueryBoundary } from "./query-boundary.tsx";
export { RegexScopeOrder } from "./regex-scope-order.tsx";
export { RegexScriptPicker } from "./regex-script-picker.tsx";
export { useReindexConfirm } from "./reindex-confirm.tsx";
export type { RelationManagerItem } from "./relation-manager-section.tsx";
export { RelationManagerSection } from "./relation-manager-section.tsx";
export type { RowDestructiveAction } from "./row-actions-menu.tsx";
export { RowActionsMenu } from "./row-actions-menu.tsx";
export { RowToggleAction } from "./row-toggle-action.tsx";
export {} from "./setting-row-actions.tsx";
export { SettingRowGroup } from "./setting-row-group.tsx";
export { SettingCheckboxRow, SettingSwitchRow } from "./setting-switch-row.tsx";
export { ConfigTeachScope, SettingRow } from "./setting-teach-row.tsx";
export { SettingTrackRow } from "./setting-track-row.tsx";
export { SettingsPane } from "./settings-pane.tsx";
export { CORNER_RADIUS_NAME } from "./shared-control-names.ts";
export { SkipToFirstRow } from "./skip-to-first-row.tsx";
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
export type { ConfigLeafValue } from "./use-config-leaf.ts";
export { configLeafKey, useConfigLeaf, useConfigLeafReadings } from "./use-config-leaf.ts";
export { useEmbedderRebuild } from "./use-embedder-rebuild.ts";
export { useFirstBootBox } from "./use-first-boot-box.ts";
export { useModelRunConfirm } from "./use-model-run-confirm.ts";
export { useRerankModel, useUtilityModel } from "./use-utility-model.ts";
export { UserMacroEditorDialog } from "./user-macro-editor-dialog.tsx";
export type { UserMacrosFormValues } from "./user-macro-editor-model.ts";
export { RerankModelDoor, UtilityModelDoor } from "./utility-model-door.tsx";
export { ViewerDialog } from "./viewer-dialog.tsx";

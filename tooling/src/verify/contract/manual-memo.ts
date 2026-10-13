// These subjects remain custom-authority owners; native memo restrictions judge every other admitted file.
/** The subjects whose memo operations remain under custom reviewed-grant authority. */
export const MANUAL_MEMO_CUSTOM_HOMES = {
  fuzzySearch: "packages/ui/src/fuzzy-search/fuzzy-search.ts",
  mediaGrid: "packages/ui/src/primitives/media-grid/media-grid.tsx",
  messageList: "packages/ui/src/primitives/message-list/message-list.tsx",
} as const;

/** React exports whose manual memoization the compiler owns. */
export const MANUAL_MEMO_EXPORTS = ["useMemo", "useCallback", "memo"] as const;

export function Dialog(): null {
  const save = useSave({ trpc, invalidation, failureShownInline: "the first-run dialog's own error toast" });
  const again = useSave({ trpc, invalidation, failureShownInline: "already declared" });
  const other = useAttach({ trpc, invalidation });
  return null;
}

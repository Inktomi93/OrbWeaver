export function Dialog(): null {
  const save = useSave({ trpc, invalidation });
  const again = useSave({ trpc, invalidation, failureShownInline: "already declared" });
  const other = useAttach({ trpc, invalidation });
  return null;
}

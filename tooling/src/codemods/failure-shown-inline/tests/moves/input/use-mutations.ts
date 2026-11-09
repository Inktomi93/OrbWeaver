export const useAttach = createEntityMutation<A, B>({
  options: (t) => t.chat.attach.mutationOptions(),
  errorToast: "Couldn't attach that.",
  busDriven: true,
});
export const useSave = createEntityMutation<A, B>({ options: (t) => t.chat.save.mutationOptions(), errorToast: "Couldn't save.", busDriven: true });

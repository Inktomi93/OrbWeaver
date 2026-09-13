// One home for the tracked open-JSON debt split. Permanent foreign-format doorways use reviewed grants.
export const OPEN_JSON_DEFERRED_SUBJECTS = new Set(["messageVariants.metadata"]);

export function isOpenJsonDeferred(subject: string): boolean {
  return OPEN_JSON_DEFERRED_SUBJECTS.has(subject);
}

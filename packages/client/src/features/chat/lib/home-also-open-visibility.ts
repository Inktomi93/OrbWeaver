/** Resolve this Home contribution against its settled production capability. */
export function homeAlsoOpenVisible(roomCount: number): boolean {
  return roomCount > 1;
}

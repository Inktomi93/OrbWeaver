/** `name, position N of M` — or the bare name when there is no rank to state: how the live region names a row. */
export function sortablePositionName(name: string, rank: number | null, total: number): string {
  return rank === null ? name : `${name}, position ${rank} of ${total}`;
}

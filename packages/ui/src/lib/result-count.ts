// The live filtered/result-count announcement text (§13.0 litmus, C20 rollup) — the same
// `${count} result(s)` pluralization was hand-spelled in autocomplete/combobox/command's Status
// components. One home means the copy can't drift between the three announcers.
export function formatResultCount(count: number): string {
  return `${count} ${count === 1 ? "result" : "results"}`;
}

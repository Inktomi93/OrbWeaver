import { Empty } from "./empty.tsx";

export const empty = (needle: string) => (
  <Empty title="No matches" label={needle === "" ? "No documents yet" : "No matches"} hint="No matches here">
    <button type="button">
      Clear search
    </button>
    <span>Clear search now</span>
  </Empty>
);

import { Empty } from "./empty.tsx";
import { NO_MATCHES_TITLE, CLEAR_SEARCH_NAME } from "#lib";

export const empty = (needle: string) => (
  <Empty title={NO_MATCHES_TITLE} label={needle === "" ? "No documents yet" : NO_MATCHES_TITLE} hint="No matches here">
    <button type="button">
      {CLEAR_SEARCH_NAME}
    </button>
    <span>Clear search now</span>
  </Empty>
);

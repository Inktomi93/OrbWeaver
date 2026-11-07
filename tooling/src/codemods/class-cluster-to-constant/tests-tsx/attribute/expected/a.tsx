import type { ReactElement } from "react";
import { FIELD_STACK } from "#lib";

export function A(): ReactElement {
  return (
    <div className={FIELD_STACK} data-x="flex flex-col gap-field">
      <span className={`${FIELD_STACK} inline-full`} label="flex flex-col gap-field" />
      <b className={`${FIELD_STACK} p-field`} />
    </div>
  );
}

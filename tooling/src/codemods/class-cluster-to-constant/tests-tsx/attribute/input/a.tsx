import type { ReactElement } from "react";

export function A(): ReactElement {
  return (
    <div className="flex flex-col gap-field" data-x="flex flex-col gap-field">
      <span className="flex flex-col gap-field inline-full" label="flex flex-col gap-field" />
      <b className={`flex flex-col gap-field p-field`} />
    </div>
  );
}

import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";

export function Name({ name }: { readonly name: string }): ReactElement {
  return (
    <>
      <Text className="truncate" title={name}>
        {name}
      </Text>
      <Text title="quest item">quest item</Text>
    </>
  );
}

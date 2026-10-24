import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";

export function Name({ name }: { readonly name: string }): ReactElement {
  return (
    <>
      <Text className="truncate">
        {name}
      </Text>
      <Text>quest item</Text>
    </>
  );
}

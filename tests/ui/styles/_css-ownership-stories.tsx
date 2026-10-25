import { CtIsolation } from "@orb/testkit/browser";
import { Card } from "@orb/ui/card";
import { Stack } from "@orb/ui/layout";
import { Swatch } from "@orb/ui/swatch";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";

/** Primitive isolation keeps the art recipe independent of message persistence and attribution. */
export function ArtRecipesStory({ image = false, theme = "mocha" }: { readonly image?: boolean; readonly theme?: "mocha" | "light" }): ReactElement {
  return (
    <CtIsolation subject="Art recipes" isolates="Primitive art geometry, masks and theme-dependent halos without application state">
      <Stack data-theme={theme} container="size" style={{ inlineSize: 320, blockSize: 640 }} gap="row">
        <Text voice="monogram" halo={true} data-case="halo">
          Wordmark
        </Text>
        <Swatch indeterminate={true} fill="primaryFaint" className="block-px inline-full" data-case="hairline" />
        <Stack container="size" style={{ inlineSize: 240, blockSize: 160 }}>
          <Text voice="monogram" artScale="portrait" solidLine={true} data-case="portrait-initial">
            P
          </Text>
          <Text voice="monogram" artScale="banner" solidLine={true} data-case="banner-initial">
            B
          </Text>
        </Stack>
        <Card artDecoration="portraitStart" data-case="portrait-start">
          Start
        </Card>
        <Card artDecoration="portraitEnd" data-case="portrait-end">
          End
        </Card>
        <Card artDecoration="stripeTop" data-case="stripe-top">
          Top
        </Card>
        <Stack artDecoration="stripeStart" data-case="stripe-start">
          Start
        </Stack>
        <Stack artMask="start" data-case="mask-start">
          Start
        </Stack>
        <Stack artMask="end" data-case="mask-end">
          End
        </Stack>
        <Stack feather="userBubble" featherSrc={image ? "/grain.svg" : undefined} data-case="band">
          Band
        </Stack>
      </Stack>
    </CtIsolation>
  );
}

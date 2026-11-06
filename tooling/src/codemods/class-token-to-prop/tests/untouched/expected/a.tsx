import { Card } from "@orb/ui/card";
import { TrackerValue } from "@orb/ui/tracker";
const conflicting = <TrackerValue ariaLabel="Act" className={narrow ? "!w-auto" : "!w-(--size-avatar-md)"} />;
const alreadySet = <Card padding="none" className="!p-0" />;
const oneArm = <Card className={isSet ? "!p-0" : undefined} />;
const guarded = <Card className={cn("p-block", isSet && "!p-0")} />;
const unplanned = <Card className="!p-0" />;
export { conflicting, alreadySet, oneArm, guarded, unplanned };

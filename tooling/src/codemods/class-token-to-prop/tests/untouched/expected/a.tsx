const a = <Card className="p-block" />;
const b = <Row className="!p-0" />;
const conflicting = <TrackerValue ariaLabel="Act" className={narrow ? "!w-auto" : "!w-(--size-avatar-md)"} />;
const alreadySet = <Card padding="none" className="!p-0" />;
const oneArm = <Card className={isSet ? "!p-0" : undefined} />;
const guarded = <Card className={cn("p-block", isSet && "!p-0")} />;
export { a, b, conflicting, alreadySet, oneArm, guarded };

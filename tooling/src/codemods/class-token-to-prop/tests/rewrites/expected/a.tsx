const bare = <Card padding="none">{child}</Card>;
const mixed = <Card className="border-l-2" padding="none" key={id} />;
const conditional = <Card className={isSet ? "border-l-2 border-l-primary" : undefined} padding="none" />;
const tracker = <TrackerValue ariaLabel="Act" className="px-field text-center" width="avatar-md" restClassName="font-semibold" />;
const auto = <TrackerValue ariaLabel="Title" className="min-w-0 max-w-full" width="auto" />;
const otherElement = <Row className="!p-0" />;
const otherToken = <Card className="p-block" />;
export { bare, mixed, conditional, tracker, auto, otherElement, otherToken };

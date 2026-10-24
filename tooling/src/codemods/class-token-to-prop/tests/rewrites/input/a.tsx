const bare = <Card className="!p-0">{child}</Card>;
const mixed = <Card className="!p-0 border-l-2" key={id} />;
const conditional = <Card className={isSet ? "!p-0 border-l-2 border-l-primary" : "!p-0"} />;
const tracker = <TrackerValue ariaLabel="Act" className="!w-(--size-avatar-md) px-field text-center" restClassName="font-semibold" />;
const auto = <TrackerValue ariaLabel="Title" className="!w-auto min-w-0 max-w-full" />;
const otherElement = <Row className="!p-0" />;
const otherToken = <Card className="p-block" />;
export { bare, mixed, conditional, tracker, auto, otherElement, otherToken };

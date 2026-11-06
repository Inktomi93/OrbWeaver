import { Row } from "@orb/ui/layout";
const spreadFirst = <Row {...props} className="justify-end" />;
const spreadLast = <Row className="justify-end" {...props} />;
const lookup = <Row className={{ open: "justify-end", closed: "" }[state]} />;
const helper = <Row className={pick("justify-end", "flex-wrap")} />;
const list = <Row className={["justify-end", "flex-wrap"].join(" ")} />;
const joined = <Row className={cn("justify-end", extra)} />;
export { spreadFirst, spreadLast, lookup, helper, list, joined };

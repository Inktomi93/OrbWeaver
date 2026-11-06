import { Row } from "@orb/ui/layout";
const shared = <><Row className="justify-end" /><Row className="justify-center justify-end" /></>;
const head = <Row className={cn("justify-end", extra)} />;
const tail = <Row className={cn(extra, "justify-end")} />;
const alone = <Row className={cn("justify-end")} />;
const braced = <Row className={"justify-end"} />;
export { shared, head, tail, alone, braced };

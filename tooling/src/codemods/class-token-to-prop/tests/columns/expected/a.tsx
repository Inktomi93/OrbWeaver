import { Row } from "@orb/ui/layout";
const shared = <><Row justify="end" /><Row className="justify-center justify-end" /></>;
const head = <Row className={cn(extra)} justify="end" />;
const tail = <Row className={cn(extra)} justify="end" />;
const alone = <Row justify="end" />;
const braced = <Row justify="end" />;
export { shared, head, tail, alone, braced };

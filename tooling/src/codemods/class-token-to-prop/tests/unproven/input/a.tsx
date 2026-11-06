import { Row } from "./local-row";
import { Row as Line } from "@orb/ui/layout";
import * as ui from "@orb/ui/layout";
function Local() {
  const Stack = () => null;
  return <Stack className="justify-end" />;
}
const sameName = <Row className="justify-end" />;
const unimported = <Gap className="justify-end" />;
const member = <ui.Row className="justify-end" />;
const wrongName = <Line className="justify-end" />;
export { Local, sameName, unimported, member, wrongName };

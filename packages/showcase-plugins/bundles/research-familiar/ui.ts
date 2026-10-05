const ui = orb.ui(1);
const SURFACE = "familiar_configuration";
const BOOK_ID_VAR = "familiar_book_id";
let bookId = "";
let error = false;
let loaded = false;
let saved = false;

function draw(): void {
  const children: PluginSurfaceNode[] = [];
  if (error) {
    children.push({ kind: "text", value: "Couldn't read or update this destination." }, { kind: "button", actionId: "retry", label: "Retry" });
  } else if (!loaded) {
    children.push({ kind: "text", value: "Loading your destination…" });
  } else {
    children.push(
      { kind: "select", name: "book", label: "Lore book", optionsFromHost: "owned-lore-books", value: bookId, actionId: "configure" },
      { kind: "text", value: "This choice does not attach the book to a room. Attach it in that room's World Info settings." },
    );
    if (saved) {
      children.push({ kind: "text", value: "Destination updated." });
    }
  }
  ui.render(SURFACE, { kind: "stack", gap: "field", children });
}

async function load(): Promise<void> {
  error = false;
  loaded = false;
  draw();
  try {
    bookId = (await ui.host.variables.get(BOOK_ID_VAR)) ?? "";
    loaded = true;
  } catch (err) {
    error = true;
    ui.log.warn(`destination read failed: ${String(err)}`);
  }
  draw();
}

ui.onEvent(async (event) => {
  if (event.surfaceId !== SURFACE || event.event.type !== "action") {
    return;
  }
  if (event.event.actionId === "retry") {
    await load();
    return;
  }
  if (event.event.actionId !== "configure") {
    return;
  }
  try {
    const selected = event.values["book"] ?? "";
    await ui.host.variables.set(BOOK_ID_VAR, selected);
    bookId = selected;
    saved = true;
  } catch (err) {
    error = true;
    ui.log.warn(`destination update failed: ${String(err)}`);
  }
  draw();
});
void load();

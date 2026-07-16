import json
with open("biome_out.json", "r") as f:
    # Just skip until [
    content = f.read()
    idx = content.find("[")
    if idx != -1:
        diags = json.loads(content[idx-14:]) # usually {"diagnostics":[...]}
    else:
        print("no bracket")

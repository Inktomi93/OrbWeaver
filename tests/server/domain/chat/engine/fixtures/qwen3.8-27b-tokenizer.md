# Qwen3.8-27B tokenizer fixture

The passage-fit test uses the tokenizer and configuration from [orcarouter/Qwen3.8-27B-Uncensored-INT8](https://huggingface.co/orcarouter/Qwen3.8-27B-Uncensored-INT8/tree/6edd48944b26ca16c50167c4fe0fba81225f559e), derived from Qwen/Qwen3.8-27B. The model repository distributes these files under the [upstream Apache 2.0 license](https://huggingface.co/orcarouter/Qwen3.8-27B-Uncensored-INT8/blob/6edd48944b26ca16c50167c4fe0fba81225f559e/LICENSE), reproduced alongside the fixture.

The gzip holds the complete JSON values from `tokenizer.json` and `tokenizer_config.json` under `tokenizer` and `config`. The test encodes the corpus provider's actual received passages with special-token insertion disabled. This fixture contains no model weights.

To reproduce the fixture, run this in the pinned model checkout and pass the test fixture's destination path.

```sh
python3 - /path/to/qwen3.8-27b-tokenizer.json.gz <<'PY'
import gzip
import json
from pathlib import Path
import sys

payload = {
    "tokenizer": json.loads(Path("tokenizer.json").read_text()),
    "config": json.loads(Path("tokenizer_config.json").read_text()),
}
data = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode()
Path(sys.argv[1]).write_bytes(gzip.compress(data, mtime=0))
PY
```

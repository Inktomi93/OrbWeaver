# The reach sweep scored by the upstream PyTorch CrossEncoder at the curated revisions, on CPU: the reference the
# local-light ONNX serving is compared against. Input is `run.ts pairs`; output is one JSON row per depth and model.
import json
import sys

import torch
from sentence_transformers import CrossEncoder

THREADS = 4
MODELS = [
    ("cross-encoder/ettin-reranker-32m-v1", "b33e5ceb5110773ea9cf5e00c9bedc83a8c2afdd"),
    ("cross-encoder/ettin-reranker-17m-v1", "9e4aa35321a6dd1a43ca313f500c4b4f7cfb5cc6"),
]

torch.set_num_threads(THREADS)
sweep = json.load(open(sys.argv[1]))
for model_id, revision in MODELS:
    model = CrossEncoder(model_id, revision=revision, device="cpu", max_length=2048)
    for p in sweep["pairs"]:
        scores = model.predict([(sweep["query"], p["with"]), (sweep["query"], p["without"]), (sweep["query"], p["first"])], batch_size=1)
        row = {
            "kind": "reference",
            "model": model_id,
            "revision": revision,
            "runtime": f"torch {torch.__version__} fp32 cpu",
            "prefixSentences": p["n"],
            "with": round(float(scores[0]), 2),
            "without": round(float(scores[1]), 2),
            "factFirst": round(float(scores[2]), 2),
        }
        print(json.dumps(row), flush=True)

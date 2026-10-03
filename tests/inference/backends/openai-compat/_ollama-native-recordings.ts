// RECORDED from the local-server rig (scripts/probes/local-servers, Ollama 0.35.1): raw `/api/chat` responses,
// byte for byte, so the native translator is tested against what the server wrote. The thinking stream keeps
// its first three thinking lines and every content line. Never hand-edit; re-record from the rig.

export const OLLAMA_NATIVE_RECORDINGS = {
  text: {
    status: 200,
    contentType: "application/x-ndjson",
    body: '{"model":"qwen2.5:0.5b","created_at":"2026-10-03T14:11:00.866073504Z","message":{"role":"assistant","content":"Hello"},"done":false}\n{"model":"qwen2.5:0.5b","created_at":"2026-10-03T14:11:00.938687507Z","message":{"role":"assistant","content":","},"done":false}\n{"model":"qwen2.5:0.5b","created_at":"2026-10-03T14:11:00.957145598Z","message":{"role":"assistant","content":" how"},"done":false}\n{"model":"qwen2.5:0.5b","created_at":"2026-10-03T14:11:00.975564056Z","message":{"role":"assistant","content":" are"},"done":false}\n{"model":"qwen2.5:0.5b","created_at":"2026-10-03T14:11:01.048244076Z","message":{"role":"assistant","content":" you"},"done":false}\n{"model":"qwen2.5:0.5b","created_at":"2026-10-03T14:11:01.067450063Z","message":{"role":"assistant","content":"?"},"done":false}\n{"model":"qwen2.5:0.5b","created_at":"2026-10-03T14:11:01.137307201Z","message":{"role":"assistant","content":""},"done":true,"done_reason":"stop","total_duration":1642715051,"load_duration":779336349,"prompt_eval_count":35,"prompt_eval_cached_count":0,"prompt_eval_duration":585500000,"eval_count":7,"eval_duration":271668000}\n',
  },
  tools: {
    status: 200,
    contentType: "application/x-ndjson",
    body: '{"model":"qwen2.5:0.5b","created_at":"2026-10-03T14:11:03.754715582Z","message":{"role":"assistant","content":"","tool_calls":[{"id":"call_s4210pyw","function":{"index":0,"name":"get_weather","arguments":{"city":"Paris"}}}]},"done":false}\n{"model":"qwen2.5:0.5b","created_at":"2026-10-03T14:11:04.001556152Z","message":{"role":"assistant","content":""},"done":true,"done_reason":"stop","total_duration":2856251319,"load_duration":2896102,"prompt_eval_count":156,"prompt_eval_cached_count":18,"prompt_eval_duration":1709067000,"eval_count":20,"eval_duration":1138820000}\n',
  },
  think: {
    status: 200,
    contentType: "application/x-ndjson",
    body: '{"model":"qwen3:0.6b","created_at":"2026-10-03T14:11:06.261947395Z","message":{"role":"assistant","content":"","thinking":"Okay"},"done":false}\n{"model":"qwen3:0.6b","created_at":"2026-10-03T14:11:06.272026855Z","message":{"role":"assistant","content":"","thinking":","},"done":false}\n{"model":"qwen3:0.6b","created_at":"2026-10-03T14:11:06.282513782Z","message":{"role":"assistant","content":"","thinking":" the"},"done":false}\n{"model":"qwen3:0.6b","created_at":"2026-10-03T14:11:09.470965502Z","message":{"role":"assistant","content":"2"},"done":false}\n{"model":"qwen3:0.6b","created_at":"2026-10-03T14:11:09.480895079Z","message":{"role":"assistant","content":" +"},"done":false}\n{"model":"qwen3:0.6b","created_at":"2026-10-03T14:11:09.543280256Z","message":{"role":"assistant","content":" "},"done":false}\n{"model":"qwen3:0.6b","created_at":"2026-10-03T14:11:09.555333548Z","message":{"role":"assistant","content":"3"},"done":false}\n{"model":"qwen3:0.6b","created_at":"2026-10-03T14:11:09.56669511Z","message":{"role":"assistant","content":" ="},"done":false}\n{"model":"qwen3:0.6b","created_at":"2026-10-03T14:11:09.579220817Z","message":{"role":"assistant","content":" "},"done":false}\n{"model":"qwen3:0.6b","created_at":"2026-10-03T14:11:09.644679428Z","message":{"role":"assistant","content":"5"},"done":false}\n{"model":"qwen3:0.6b","created_at":"2026-10-03T14:11:09.656748503Z","message":{"role":"assistant","content":"."},"done":false}\n{"model":"qwen3:0.6b","created_at":"2026-10-03T14:11:09.668151147Z","message":{"role":"assistant","content":""},"done":true,"done_reason":"stop","total_duration":5657458737,"load_duration":2127244703,"prompt_eval_count":20,"prompt_eval_cached_count":0,"prompt_eval_duration":101968000,"eval_count":137,"eval_duration":3426459000}\n',
  },
  vision: {
    status: 200,
    contentType: "application/x-ndjson",
    body: '{"model":"moondream:latest","created_at":"2026-10-03T14:11:23.477284859Z","message":{"role":"assistant","content":""},"done":true,"done_reason":"stop","total_duration":13807360237,"load_duration":1772933135,"prompt_eval_count":745,"prompt_eval_cached_count":0,"prompt_eval_duration":12028313000,"eval_count":1,"eval_duration":1000}\n',
  },
  format: {
    status: 200,
    contentType: "application/json; charset=utf-8",
    body: '{"model":"qwen2.5:0.5b","created_at":"2026-10-03T14:11:24.457294078Z","message":{"role":"assistant","content":"{\\n  \\"city\\": \\"Paris\\"\\n}"},"done":true,"done_reason":"stop","total_duration":977732393,"load_duration":1066851,"prompt_eval_count":37,"prompt_eval_cached_count":24,"prompt_eval_duration":370555000,"eval_count":10,"eval_duration":603996000}',
  },
  missing: { status: 404, contentType: "application/json; charset=utf-8", body: '{"error":"model \'no-such-model:latest\' not found"}' },
} as const;

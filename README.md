# AgentOps Studio

Watch an AI agent run, step by step, as spans and metrics stream into SigNoz — and when a step fails, the app itself queries SigNoz's MCP server and asks an LLM to explain the root cause. No human has to open a dashboard to find out what broke.

## What this is

A single Next.js app that:
1. Runs a simulated 5-step research agent (`plan -> search_tool -> llm_call -> critique -> finalize`), instrumented end-to-end with OpenTelemetry (traces + GenAI-convention attributes + RED/token/cost metrics), exported to SigNoz.
2. Has a deliberately flaky tool step (~30% failure) so there's always something real to demo.
3. On failure, calls the **SigNoz MCP server** to fetch the actual trace/log data for that run, hands it to an LLM, and shows a plain-English root-cause diagnosis right in the UI.

## Architecture

```
Next.js app (single process)
 ├─ app/page.tsx            UI: trigger runs, watch live status, view diagnosis
 ├─ app/api/agent/run       POST -> executes the agent loop
 ├─ app/api/agent/runs      GET  -> run history (polled by UI)
 ├─ app/api/agent/diagnose  POST -> SigNoz MCP query -> LLM explanation
 ├─ lib/agent/agent.ts      the instrumented agent loop
 ├─ lib/otel/register.ts    OTEL SDK bootstrap -> OTLP/HTTP -> SigNoz
 ├─ lib/mcp/diagnose.ts     MCP client -> SigNoz MCP server -> LLM
 └─ lib/store/runStore.ts   run history, JSON file (no DB needed)

SigNoz (deployed via Foundry, see casting.yaml)
 ├─ OTLP receiver :4318     <- traces & metrics from this app
 ├─ Web UI        :8080     <- dashboards, traces, alerts
 └─ MCP server    :8000     <- queried by lib/mcp/diagnose.ts
```

## Setup

### 1. Deploy SigNoz with Foundry

```bash
# install foundryctl — see https://github.com/SigNoz/foundry getting-started
foundryctl gauge -f casting.yaml   # validate prerequisites
foundryctl cast -f casting.yaml    # generate + deploy (writes casting.yaml.lock)
```

Commit the generated `casting.yaml.lock` — judges reproduce your deployment from `casting.yaml` + `casting.yaml.lock`.

Confirm SigNoz is up at http://localhost:8080.

Create an API key: SigNoz UI -> Settings -> Service Accounts (requires Admin role).

### 2. Configure this app

```bash
cp .env.example .env.local
# fill in SIGNOZ_API_KEY and ANTHROPIC_API_KEY
npm install
npm run dev
```

Open http://localhost:3000. Click "Run agent" a few times — about 30% of runs will fail at the `search_tool` step. Click "Diagnose via SigNoz MCP" on a failed run to see the self-diagnosis.

### 3. In SigNoz

- **Traces**: find `agent.run` traces, expand to see nested `agent.step.*`, `tool.invoke`, `llm.call` spans.
- **Dashboards**: build panels off `agent.duration_ms`, `agent.errors_total`, `agent.input_tokens` / `agent.output_tokens`, `agent.cost_usd`.
- **Alerts**: e.g. `agent.errors_total` rate > 0 over 5 min, or `agent.duration_ms` p95 > threshold.

## Notes for judges

- Reproducible deployment: `casting.yaml` + `casting.yaml.lock` (Foundry).
- Uses OTEL traces, metrics, GenAI semantic conventions, SigNoz dashboards, alerts, and the SigNoz MCP server (query + AI use case, not just ingestion).
- AI-assistant disclosure: this project's scaffold and instrumentation code were built with Claude (Anthropic) as a coding assistant.

## Known limitations / next steps

- `search_tool` and `llm_call` are simulated (randomized latency/failure/token counts) rather than calling real external APIs — swap in real implementations in `lib/agent/agent.ts` if you have time.
- The MCP tool name used in `lib/mcp/diagnose.ts` is auto-discovered by matching `/trace|span/i` against the SigNoz MCP server's tool list. Log the discovered tools once and pin the exact name if you want tighter control.
- Run history is a flat JSON file — fine for a demo, swap for Postgres/SQLite if you extend this past the hackathon.

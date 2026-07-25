import { trace, metrics } from "@opentelemetry/api";

// One tracer/meter per service, named after this app. Reused everywhere
// instead of re-creating per call.
export const tracer = trace.getTracer("agentops-studio");
export const meter = metrics.getMeter("agentops-studio");

// --- Metrics (RED + AI-specific) -------------------------------------
// These show up in SigNoz's metrics explorer / dashboards immediately
// once at least one data point has been recorded.

export const agentRunsTotal = meter.createCounter("agent.requests_total", {
  description: "Number of agent workflow runs started",
});

export const agentErrorsTotal = meter.createCounter("agent.errors_total", {
  description: "Number of agent workflow runs that ended in failure",
});

export const agentDurationMs = meter.createHistogram("agent.duration_ms", {
  description: "End-to-end duration of an agent run",
  unit: "ms",
});

export const agentInputTokens = meter.createHistogram("agent.input_tokens", {
  description: "Tokens sent to the LLM per call",
});

export const agentOutputTokens = meter.createHistogram("agent.output_tokens", {
  description: "Tokens received from the LLM per call",
});

export const agentCostUsd = meter.createHistogram("agent.cost_usd", {
  description: "Estimated USD cost per agent run",
});

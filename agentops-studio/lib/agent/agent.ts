import { context, SpanStatusCode, trace } from "@opentelemetry/api";
import { nanoid } from "nanoid";
import {
  tracer,
  agentRunsTotal,
  agentErrorsTotal,
  agentDurationMs,
  agentInputTokens,
  agentOutputTokens,
  agentCostUsd,
} from "../otel/handles";
import { AgentRun, RunStep, saveRun } from "../store/runStore";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Fake per-1k-token pricing, just for a plausible cost.usd metric.
const COST_PER_1K_INPUT = 0.003;
const COST_PER_1K_OUTPUT = 0.015;

function fakeTokenUsage() {
  const input = 200 + Math.floor(Math.random() * 800);
  const output = 100 + Math.floor(Math.random() * 400);
  return { input, output };
}

/**
 * The "tool" step is deliberately flaky (~30% failure) so the demo has
 * real failures to show, not just a happy path. This is what the
 * SigNoz-MCP self-diagnosis feature (see lib/mcp/diagnose.ts) explains.
 */
async function searchTool(query: string) {
  await sleep(300 + Math.random() * 500);
  if (Math.random() < 0.3) {
    throw new Error(
      `search_tool: upstream timeout after 3000ms while querying "${query}"`
    );
  }
  return `3 relevant sources found for "${query}"`;
}

async function llmCall(prompt: string) {
  await sleep(400 + Math.random() * 900);
  const usage = fakeTokenUsage();
  return { text: `Synthesized answer for: ${prompt}`, usage };
}

export async function runAgent(input: string): Promise<AgentRun> {
  const runId = nanoid(10);
  const startedAt = Date.now();

  const steps: RunStep[] = [
    { name: "plan", status: "pending" },
    { name: "search_tool", status: "pending" },
    { name: "llm_call", status: "pending" },
    { name: "critique", status: "pending" },
    { name: "finalize", status: "pending" },
  ];

  const run: AgentRun = {
    id: runId,
    traceId: "", // filled in once the root span starts
    input,
    status: "running",
    steps,
    startedAt,
  };

  agentRunsTotal.add(1);

  await tracer.startActiveSpan("agent.run", async (rootSpan) => {
    run.traceId = rootSpan.spanContext().traceId;
    rootSpan.setAttribute("gen_ai.operation.name", "run_agent");
    rootSpan.setAttribute("agent.run_id", runId);
    rootSpan.setAttribute("agent.input", input);
    await saveRun(run);

    const markStep = async (i: number, status: RunStep["status"], detail?: string) => {
      steps[i] = {
        ...steps[i],
        status,
        detail,
        startedAt: steps[i].startedAt ?? Date.now(),
        finishedAt: status === "ok" || status === "error" ? Date.now() : undefined,
      };
      await saveRun(run);
    };

    try {
      // --- Step 1: plan ---------------------------------------------
      await tracer.startActiveSpan("agent.step.plan", async (span) => {
        span.setAttribute("step.index", 0);
        span.setAttribute("step.type", "plan");
        await markStep(0, "running");
        await sleep(150);
        await markStep(0, "ok", "Decomposed request into a search + synthesis plan");
        span.end();
      });

      // --- Step 2: tool call (flaky) ----------------------------------
      await markStep(1, "running");
      await tracer.startActiveSpan("tool.invoke", async (span) => {
        span.setAttribute("tool.name", "search_tool");
        const t0 = Date.now();
        try {
          const result = await searchTool(input);
          span.setAttribute("tool.success", true);
          span.setAttribute("tool.duration_ms", Date.now() - t0);
          await markStep(1, "ok", result);
          span.end();
        } catch (err) {
          span.setAttribute("tool.success", false);
          span.setAttribute("tool.duration_ms", Date.now() - t0);
          span.recordException(err as Error);
          span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
          span.end();
          throw err;
        }
      });

      // --- Step 3: llm call --------------------------------------------
      await markStep(2, "running");
      const llmResult = await tracer.startActiveSpan("llm.call", async (span) => {
        span.setAttribute("gen_ai.provider.name", "anthropic");
        span.setAttribute("gen_ai.request.model", "claude-sonnet-5");
        const result = await llmCall(input);
        span.setAttribute("gen_ai.usage.input_tokens", result.usage.input);
        span.setAttribute("gen_ai.usage.output_tokens", result.usage.output);
        agentInputTokens.record(result.usage.input);
        agentOutputTokens.record(result.usage.output);
        const cost =
          (result.usage.input / 1000) * COST_PER_1K_INPUT +
          (result.usage.output / 1000) * COST_PER_1K_OUTPUT;
        agentCostUsd.record(cost);
        span.setAttribute("gen_ai.cost_usd", cost);
        span.end();
        return result;
      });
      await markStep(2, "ok", llmResult.text);

      // --- Step 4: critique ----------------------------------------------
      await markStep(3, "running");
      await tracer.startActiveSpan("agent.step.critique", async (span) => {
        span.setAttribute("step.index", 3);
        span.setAttribute("step.type", "critique");
        await sleep(200);
        span.end();
      });
      await markStep(3, "ok", "Self-review passed");

      // --- Step 5: finalize ------------------------------------------
      await markStep(4, "running");
      await tracer.startActiveSpan("agent.step.finalize", async (span) => {
        span.setAttribute("step.index", 4);
        span.setAttribute("step.type", "finalize");
        await sleep(100);
        span.end();
      });
      await markStep(4, "ok", "Response finalized");

      run.status = "ok";
      rootSpan.setAttribute("success", true);
    } catch (err) {
      run.status = "error";
      run.errorMessage = (err as Error).message;
      agentErrorsTotal.add(1);
      rootSpan.setAttribute("success", false);
      rootSpan.recordException(err as Error);
      rootSpan.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
      // Mark whichever step was "running" as the failure point.
      const runningIdx = steps.findIndex((s) => s.status === "running");
      if (runningIdx >= 0) {
        steps[runningIdx] = {
          ...steps[runningIdx],
          status: "error",
          detail: (err as Error).message,
          finishedAt: Date.now(),
        };
      }
    } finally {
      run.finishedAt = Date.now();
      agentDurationMs.record(run.finishedAt - run.startedAt);
      await saveRun(run);
      rootSpan.end();
    }
  });

  return run;
}

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { AgentRun } from "../store/runStore";

/**
 * This is the differentiator: instead of a human opening SigNoz to read
 * the trace, the agent queries SigNoz's own MCP server for its trace/log
 * data and asks an LLM to explain what went wrong — closing the loop from
 * "agent fails" to "agent explains its own failure" with zero human in
 * the middle.
 *
 * Enable the MCP server in casting.yaml (mcp.spec.enabled: true), create a
 * service-account API key in SigNoz (Settings -> Service Accounts), and
 * set SIGNOZ_MCP_URL / SIGNOZ_API_KEY in .env.local.
 */

async function getSignozTraceContext(traceId: string): Promise<string> {
  const url = process.env.SIGNOZ_MCP_URL ?? "http://localhost:8000/mcp";
  const apiKey = process.env.SIGNOZ_API_KEY;

  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: {
      headers: apiKey ? { "SIGNOZ-API-KEY": apiKey } : {},
    },
  });

  const client = new Client({ name: "agentops-studio", version: "0.1.0" });
  await client.connect(transport);

  try {
    const { tools } = await client.listTools();

    // Tool names can vary by SigNoz MCP version, so we search rather than
    // hardcode. Log `tools` once locally and pin an exact name here once
    // you've confirmed it for your install — this keeps the demo resilient
    // to naming changes rather than crashing on a wrong guess.
    const traceTool = tools.find((t) =>
      /trace/i.test(t.name) || /span/i.test(t.name)
    );

    if (!traceTool) {
      return `[No trace-query tool found on SigNoz MCP server. Available tools: ${tools
        .map((t) => t.name)
        .join(", ")}]`;
    }

    const result = await client.callTool({
      name: traceTool.name,
      arguments: { traceId },
    });

    const content = Array.isArray(result.content) ? result.content : [];
    return content
      .map((c) => ("text" in c ? c.text : JSON.stringify(c)))
      .join("\n")
      .slice(0, 6000); // keep the LLM prompt bounded
  } finally {
    await client.close();
  }
}

async function askLlmToExplain(run: AgentRun, traceContext: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return "[Set ANTHROPIC_API_KEY in .env.local to enable AI-generated diagnosis. Raw trace context was retrieved successfully — see server logs.]";
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: `An AI agent run failed. Here is the run summary and the SigNoz trace/log context pulled via MCP. In 3-4 sentences, explain the likely root cause in plain language and suggest one concrete fix.\n\nRun input: ${run.input}\nError: ${run.errorMessage}\nSteps: ${JSON.stringify(run.steps)}\n\nSigNoz trace context:\n${traceContext}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    return `[LLM diagnosis request failed: ${response.status} ${await response.text()}]`;
  }

  const data = await response.json();
  const text = data.content
    ?.filter((b: { type: string }) => b.type === "text")
    .map((b: { text: string }) => b.text)
    .join("\n");
  return text ?? "[No diagnosis text returned]";
}

export async function diagnoseRun(run: AgentRun): Promise<string> {
  try {
    const traceContext = await getSignozTraceContext(run.traceId);
    return await askLlmToExplain(run, traceContext);
  } catch (err) {
    return `[Diagnosis failed: ${(err as Error).message}. Check SIGNOZ_MCP_URL/SIGNOZ_API_KEY and that Foundry's casting.yaml has mcp.spec.enabled: true.]`;
  }
}

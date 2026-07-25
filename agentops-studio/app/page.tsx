"use client";

import { useEffect, useState, useCallback } from "react";

interface RunStep {
  name: string;
  status: "pending" | "running" | "ok" | "error";
  detail?: string;
}

interface AgentRun {
  id: string;
  traceId: string;
  input: string;
  status: "running" | "ok" | "error";
  steps: RunStep[];
  startedAt: number;
  finishedAt?: number;
  errorMessage?: string;
  diagnosis?: string;
}

const SIGNOZ_BASE_URL = process.env.NEXT_PUBLIC_SIGNOZ_BASE_URL || "http://localhost:8080";

function elapsed(run: AgentRun) {
  const end = run.finishedAt ?? Date.now();
  return `${((end - run.startedAt) / 1000).toFixed(1)}s`;
}

export default function Home() {
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [input, setInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [diagnosing, setDiagnosing] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/agent/runs");
    if (res.ok) setRuns(await res.json());
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 1500);
    return () => clearInterval(id);
  }, [refresh]);

  const trigger = async () => {
    setSubmitting(true);
    try {
      await fetch("/api/agent/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input }),
      });
      setInput("");
      await refresh();
    } finally {
      setSubmitting(false);
    }
  };

  const diagnose = async (runId: string) => {
    setDiagnosing(runId);
    try {
      await fetch("/api/agent/diagnose", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ runId }),
      });
      await refresh();
    } finally {
      setDiagnosing(null);
    }
  };

  return (
    <div className="shell">
      <div className="masthead">
        <div>
          <h1>
            <span className="dot" />
            AgentOps Studio
          </h1>
          <div className="sub">every run traced · every failure explained</div>
        </div>
        <a
          className="trace-link"
          href={SIGNOZ_BASE_URL}
          target="_blank"
          rel="noreferrer"
        >
          Open SigNoz →
        </a>
      </div>

      <div className="console">
        <input
          placeholder='Task for the agent, e.g. "Summarize latest AI observability trends"'
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !submitting && trigger()}
        />
        <button onClick={trigger} disabled={submitting}>
          {submitting ? "Running…" : "Run agent"}
        </button>
      </div>

      {runs.length === 0 ? (
        <div className="empty">No runs yet. Trigger one above.</div>
      ) : (
        <div className="strip-list">
          {runs.map((run) => (
            <div className="strip" key={run.id} data-status={run.status}>
              <div className="strip-row1">
                <div className="strip-input">{run.input}</div>
                <div className="strip-meta">
                  <span>{elapsed(run)}</span>
                  <span>{run.status}</span>
                  <a
                    className="trace-link"
                    href={`${SIGNOZ_BASE_URL}/trace/${run.traceId}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    trace {run.traceId.slice(0, 8)} →
                  </a>
                </div>
              </div>

              <div className="steps">
                {run.steps.map((s) => (
                  <div className="step-chip" key={s.name} data-status={s.status}>
                    <span className="indicator" />
                    {s.name}
                  </div>
                ))}
              </div>

              {run.status === "error" && (
                <div className="strip-footer">{run.errorMessage}</div>
              )}

              {run.status === "error" && !run.diagnosis && (
                <button
                  className="diagnose-btn"
                  onClick={() => diagnose(run.id)}
                  disabled={diagnosing === run.id}
                >
                  {diagnosing === run.id
                    ? "Querying SigNoz MCP…"
                    : "Diagnose via SigNoz MCP"}
                </button>
              )}

              {run.diagnosis && (
                <div className="diagnosis-box">
                  <span className="label">AI diagnosis (via SigNoz MCP)</span>
                  {run.diagnosis}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

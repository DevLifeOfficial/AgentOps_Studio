import { promises as fs } from "fs";
import path from "path";

// Deliberately not a real database. For a hackathon demo, a JSON file is
// zero-dependency and trivially reproducible — judges don't need to spin
// up Postgres just to see run history. Swap for a real DB post-hackathon.

export type StepStatus = "pending" | "running" | "ok" | "error";

export interface RunStep {
  name: string;
  status: StepStatus;
  startedAt?: number;
  finishedAt?: number;
  detail?: string;
}

export interface AgentRun {
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

const DATA_FILE = path.join(process.cwd(), "data", "runs.json");

async function readAll(): Promise<AgentRun[]> {
  try {
    const raw = await fs.readFile(DATA_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

async function writeAll(runs: AgentRun[]) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  await fs.writeFile(DATA_FILE, JSON.stringify(runs, null, 2));
}

export async function saveRun(run: AgentRun) {
  const runs = await readAll();
  const idx = runs.findIndex((r) => r.id === run.id);
  if (idx >= 0) runs[idx] = run;
  else runs.unshift(run);
  await writeAll(runs.slice(0, 100)); // cap history
}

export async function listRuns(): Promise<AgentRun[]> {
  return readAll();
}

export async function getRun(id: string): Promise<AgentRun | undefined> {
  const runs = await readAll();
  return runs.find((r) => r.id === id);
}

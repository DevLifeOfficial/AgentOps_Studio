import { NextRequest, NextResponse } from "next/server";
import { getRun, saveRun } from "../../../../lib/store/runStore";
import { diagnoseRun } from "../../../../lib/mcp/diagnose";

export async function POST(req: NextRequest) {
  const { runId } = await req.json();
  const run = await getRun(runId);
  if (!run) {
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }

  const diagnosis = await diagnoseRun(run);
  run.diagnosis = diagnosis;
  await saveRun(run);

  return NextResponse.json({ diagnosis });
}

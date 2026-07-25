import { NextRequest, NextResponse } from "next/server";
import { runAgent } from "../../../../lib/agent/agent";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const input = typeof body.input === "string" && body.input.trim()
    ? body.input.trim()
    : "Summarize recent developments in AI observability";

  const run = await runAgent(input);
  return NextResponse.json(run);
}

import { NextResponse } from "next/server";
import { loadAgents } from "@/lib/agent-store";
import { getWorkingDirectory } from "@/lib/thread-store";

export async function GET() {
  const agents = await loadAgents();
  return NextResponse.json({
    workingDirectory: getWorkingDirectory(),
    agents,
  });
}

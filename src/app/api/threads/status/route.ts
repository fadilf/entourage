import { NextResponse } from "next/server";
import { getProcessManager } from "@/lib/process-manager";

export async function GET() {
  const pm = getProcessManager();
  return NextResponse.json(pm.getAllStatuses());
}

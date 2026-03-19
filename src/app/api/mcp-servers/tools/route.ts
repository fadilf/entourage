import { NextResponse } from "next/server";
import { getMcpClientManager } from "@/lib/mcp-client-manager";

export async function GET() {
  const manager = getMcpClientManager();
  return NextResponse.json(manager.getAllAppTools());
}

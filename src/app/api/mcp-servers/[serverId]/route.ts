import { NextResponse } from "next/server";
import { removeMcpServer } from "@/lib/mcp-store";
import { getMcpClientManager } from "@/lib/mcp-client-manager";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ serverId: string }> }
) {
  const { serverId } = await params;
  const manager = getMcpClientManager();
  await manager.disconnect(serverId);
  await removeMcpServer(serverId);
  return NextResponse.json({ ok: true });
}

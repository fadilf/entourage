import { NextResponse } from "next/server";
import { loadMcpServers, addMcpServer } from "@/lib/mcp-store";
import { getMcpClientManager } from "@/lib/mcp-client-manager";

export async function GET() {
  const servers = await loadMcpServers();
  const manager = getMcpClientManager();
  const statuses = manager.getConnectionStatus();
  const statusMap = new Map(statuses.map((s) => [s.serverId, s]));
  return NextResponse.json(
    servers.map((s) => ({
      ...s,
      connected: statusMap.has(s.id),
      appToolCount: statusMap.get(s.id)?.toolCount ?? 0,
    }))
  );
}

export async function POST(request: Request) {
  const { name, transport, command, args, env, url } = await request.json();
  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  const isSSE = transport === "sse";
  if (isSSE && !url) {
    return NextResponse.json({ error: "url is required for remote servers" }, { status: 400 });
  }
  if (!isSSE && !command) {
    return NextResponse.json({ error: "command is required for local servers" }, { status: 400 });
  }

  const server = await addMcpServer({
    name,
    transport: isSSE ? "sse" : "stdio",
    ...(isSSE
      ? { url }
      : { command, args: args ?? [], env: env ?? undefined }),
  });
  const manager = getMcpClientManager();
  try {
    await manager.connect(server);
  } catch (err) {
    return NextResponse.json({
      ...server,
      connected: false,
      error: (err as Error).message,
    });
  }
  return NextResponse.json({ ...server, connected: true });
}

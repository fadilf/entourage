import { NextResponse } from "next/server";
import { getMcpClientManager } from "@/lib/mcp-client-manager";

export async function POST(request: Request) {
  const { action, serverId, toolName, args, uri } = await request.json();
  const manager = getMcpClientManager();

  try {
    if (action === "readResource") {
      const html = await manager.readResource(serverId, uri);
      return NextResponse.json({ html });
    }
    if (action === "callTool") {
      const result = await manager.callTool(serverId, toolName, args ?? {});
      return NextResponse.json({ result });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 }
    );
  }
}

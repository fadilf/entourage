import { getTerminalManager } from "@/lib/terminal-manager";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sessionId = url.searchParams.get("sessionId");

  if (!sessionId) {
    return new Response("sessionId is required", { status: 400 });
  }

  const tm = getTerminalManager();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const listener = (data: string) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Stream closed
          tm.removeListener(sessionId, listener);
        }
      };

      // Attach and get buffered output
      const buffer = tm.addListener(sessionId, listener);

      if (buffer === null) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Session not found" })}\n\n`));
        controller.close();
        return;
      }

      // Send buffered output for re-attachment
      for (const chunk of buffer) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      }

      // Clean up on abort
      request.signal.addEventListener("abort", () => {
        tm.removeListener(sessionId, listener);
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

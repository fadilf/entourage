"use client";

import { useState } from "react";
import { threads } from "@/data/threads";
import ThreadList from "@/components/ThreadList";
import ThreadDetail from "@/components/ThreadDetail";

export default function Home() {
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(
    threads[0].id
  );

  const selectedThread =
    threads.find((t) => t.id === selectedThreadId) ?? null;

  return (
    <div className="flex h-screen bg-white text-zinc-900">
      <ThreadList
        threads={threads}
        selectedThreadId={selectedThreadId}
        onSelectThread={setSelectedThreadId}
      />
      <ThreadDetail thread={selectedThread} />
    </div>
  );
}

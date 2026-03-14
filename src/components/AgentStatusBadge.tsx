export default function AgentStatusBadge({
  status,
}: {
  status: "idle" | "running" | "error";
}) {
  const colors = {
    idle: "bg-zinc-300",
    running: "bg-green-500",
    error: "bg-red-500",
  };

  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${colors[status]} ${
        status === "running" ? "animate-pulse" : ""
      }`}
    />
  );
}

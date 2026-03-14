import { AgentModel } from "@/data/threads";

const iconPaths: Record<AgentModel, string> = {
  claude: "/agent-icons/Claude_AI_symbol.svg",
  gemini: "/agent-icons/Google_Gemini_icon_2025.svg",
  codex: "/agent-icons/codex-color.svg",
};

export default function ModelIcon({
  model,
  className = "h-4 w-4",
}: {
  model: AgentModel;
  className?: string;
}) {
  return (
    <img
      src={iconPaths[model]}
      alt={model}
      className={className}
      draggable={false}
    />
  );
}

import { AgentModel, AgentIcon } from "@/lib/types";
import { renderAgentIcon } from "./IconPicker";

const iconPaths: Record<AgentModel, string> = {
  claude: "/agent-icons/Claude_AI_symbol.svg",
  gemini: "/agent-icons/Google_Gemini_icon_2025.svg",
};

export default function ModelIcon({
  model,
  icon,
  className = "h-4 w-4",
}: {
  model: AgentModel;
  icon?: AgentIcon;
  className?: string;
}) {
  if (icon) {
    return renderAgentIcon(icon, className);
  }

  return (
    <img
      src={iconPaths[model]}
      alt={model}
      className={className}
      draggable={false}
    />
  );
}

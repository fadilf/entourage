import Image from "next/image";
import { AgentModel, Icon } from "@/lib/types";
import { renderIcon } from "./IconPicker";

const iconPaths: Record<AgentModel, string> = {
  claude: "/agent-icons/Claude_AI_symbol.svg",
  codex: "/agent-icons/codex-color.svg",
};

export default function ModelIcon({
  model,
  icon,
  className = "h-4 w-4",
}: {
  model: AgentModel;
  icon?: Icon;
  className?: string;
}) {
  if (icon) {
    return renderIcon(icon, className);
  }

  return (
    <Image
      src={iconPaths[model]}
      alt={model}
      width={16}
      height={16}
      unoptimized
      className={className}
      draggable={false}
    />
  );
}

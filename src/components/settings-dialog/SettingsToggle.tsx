type SettingsToggleProps = {
  checked: boolean;
  onClick: () => void | Promise<void>;
  title?: string;
};

export default function SettingsToggle({
  checked,
  onClick,
  title,
}: SettingsToggleProps) {
  return (
    <button
      onClick={onClick}
      className={`relative h-6 w-11 rounded-full transition-colors ${
        checked ? "bg-violet-600" : "bg-zinc-300 dark:bg-zinc-600"
      }`}
      title={title}
    >
      <span
        className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-5" : ""
        }`}
      />
    </button>
  );
}

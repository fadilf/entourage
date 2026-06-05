"use client";

import { useEffect, useState } from "react";
import { Clock, X, Play } from "lucide-react";

/**
 * Banner shown when the model scheduled an auto-continuation via ScheduleWakeup.
 * Counts down to the moment the agent will be re-prompted, with a cancel button.
 * When the chained-wakeup safety cap was hit (`fireAt === null`), it instead
 * offers a manual "Continue now".
 */
export default function WakeupIndicator({
  agentName,
  fireAt,
  reason,
  onCancel,
  onContinue,
}: {
  agentName: string;
  fireAt: number | null;
  reason?: string;
  onCancel: () => void;
  onContinue: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (fireAt === null) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [fireAt]);

  const capped = fireAt === null;
  const remaining = capped ? 0 : Math.max(0, Math.ceil((fireAt - now) / 1000));

  return (
    <div className="flex items-center gap-2 border-b border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/20 px-6 py-2">
      <Clock className="h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-400" />
      <span className="min-w-0 flex-1 truncate text-xs text-violet-700 dark:text-violet-300">
        {capped ? (
          <>Auto-continue paused for <span className="font-medium">{agentName}</span> — wakeup limit reached.</>
        ) : (
          <>
            Continuing <span className="font-medium">{agentName}</span> in {remaining}s
            {reason ? <span className="text-violet-500 dark:text-violet-400"> — {reason}</span> : null}
          </>
        )}
      </span>
      {capped && (
        <button
          onClick={onContinue}
          className="flex shrink-0 items-center gap-1 rounded-md bg-violet-200 dark:bg-violet-800 px-2 py-0.5 text-[11px] font-medium text-violet-800 dark:text-violet-200 hover:bg-violet-300 dark:hover:bg-violet-700"
        >
          <Play className="h-3 w-3" />
          Continue now
        </button>
      )}
      <button
        onClick={onCancel}
        className="flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-violet-700 dark:text-violet-300 hover:bg-violet-200 dark:hover:bg-violet-800"
      >
        <X className="h-3 w-3" />
        Cancel
      </button>
    </div>
  );
}

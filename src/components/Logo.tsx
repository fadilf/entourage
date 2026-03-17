"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

interface LogoProps {
  className?: string;
}

export default function Logo({ className = "h-7 w-7" }: LogoProps) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  const isDark = mounted && resolvedTheme === "dark";
  const primary = isDark ? "#2dd4bf" : "#0d9488";
  const secondary = isDark ? "#5eead4" : "#14b8a6";

  return (
    <svg
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect x="25" y="20" width="50" height="8" rx="4" fill={primary} />
      <rect x="25" y="34" width="38" height="8" rx="4" fill={secondary} />
      <rect x="25" y="48" width="46" height="8" rx="4" fill={primary} />
      <rect x="25" y="62" width="32" height="8" rx="4" fill={secondary} />
      <rect x="25" y="76" width="50" height="8" rx="4" fill={primary} />
    </svg>
  );
}

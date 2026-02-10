import { useState, useEffect } from "react";

interface SidebarSectionProps {
  title: string;
  icon?: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  storageKey?: string;
}

export default function SidebarSection({
  title,
  icon,
  children,
  defaultExpanded = true,
  storageKey,
}: SidebarSectionProps) {
  const [isExpanded, setIsExpanded] = useState(() => {
    if (!storageKey) return defaultExpanded;
    try {
      const saved = localStorage.getItem(storageKey);
      return saved !== null ? saved === "true" : defaultExpanded;
    } catch {
      return defaultExpanded;
    }
  });

  useEffect(() => {
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, String(isExpanded));
      } catch {
        // Ignore localStorage errors
      }
    }
  }, [isExpanded, storageKey]);

  return (
    <div className="border-b border-white/10">
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium hover:bg-white/5 transition-colors"
        onClick={() => setIsExpanded((prev) => !prev)}
        aria-expanded={isExpanded}
      >
        <span className="flex items-center gap-2">
          {icon && <span className="text-base">{icon}</span>}
          {title}
        </span>
        <svg
          className={`w-4 h-4 transition-transform duration-200 ${
            isExpanded ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      <div
        className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 ${
          isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="min-h-0">
          <div className="px-4 pb-3 space-y-3">{children}</div>
        </div>
      </div>
    </div>
  );
}

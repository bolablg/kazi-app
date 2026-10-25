import { useEffect, useId, useState, type ReactNode } from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";

export function ResponsiveFilters({
  activeCount,
  children,
}: {
  activeCount: number;
  children: ReactNode;
}) {
  const id = useId();
  const [compact, setCompact] = useState(
    () => window.matchMedia?.("(max-width: 700px)").matches ?? false,
  );
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const media = window.matchMedia?.("(max-width: 700px)");
    if (!media) return;
    const change = () => setCompact(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  return (
    <div className="responsive-filter-group">
      {compact && (
        <button
          type="button"
          className="button secondary filter-disclosure"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded(!expanded)}
        >
          <SlidersHorizontal size={16} /> Filters{" "}
          {activeCount > 0 && (
            <span className="filter-active-count">{activeCount}</span>
          )}
          <ChevronDown size={14} className={expanded ? "expanded" : ""} />
        </button>
      )}
      <div id={id} className="additional-filters" hidden={compact && !expanded}>
        {children}
      </div>
    </div>
  );
}

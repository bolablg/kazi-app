import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowLeftRight } from "lucide-react";

/** Keep wide data tables usable without making the page scroll sideways. */
export function ScrollTable({
  children,
  label,
  className = "report-table-wrap",
}: {
  children: ReactNode;
  label: string;
  className?: string;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () =>
      setOverflow(element.scrollWidth > element.clientWidth + 1);
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    measure();
    return () => observer.disconnect();
  }, [children]);
  return (
    <div className="table-scroll-region">
      {overflow && (
        <span className="table-scroll-hint" aria-hidden="true">
          <ArrowLeftRight size={14} /> Scroll to see all columns
        </span>
      )}
      <div
        ref={viewport}
        className={className}
        role={overflow ? "region" : undefined}
        aria-label={overflow ? label : undefined}
        tabIndex={overflow ? 0 : undefined}
      >
        {children}
      </div>
    </div>
  );
}

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";

export function InfoTip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const pinned = useRef(false),
    hovering = useRef(false),
    focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 16, top: 16 });
  const dismiss = () => {
    clearTimeout(timer.current);
    pinned.current = false;
    setOpen(false);
  };
  const show = () => {
    clearTimeout(timer.current);
    setOpen(true);
  };
  const leave = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (!pinned.current && !hovering.current && !focused.current)
        setOpen(false);
    }, 120);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = button.current?.getBoundingClientRect();
      const box = bubble.current?.getBoundingClientRect();
      if (!anchor || !box) return;
      if (anchor.bottom < 0 || anchor.top > innerHeight) {
        dismiss();
        return;
      }
      const top =
        anchor.bottom + 8 + box.height <= innerHeight - 12
          ? anchor.bottom + 8
          : anchor.top - box.height - 8;
      setPosition({
        left: Math.max(12, Math.min(anchor.left, innerWidth - box.width - 12)),
        top: Math.max(12, Math.min(top, innerHeight - box.height - 12)),
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (
        !button.current?.contains(event.target as Node) &&
        !bubble.current?.contains(event.target as Node)
      )
        dismiss();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        dismiss();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape, true);
    };
  }, [open]);
  return (
    <>
      <button
        ref={button}
        type="button"
        className="info-tip-trigger"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        aria-describedby={open ? id : undefined}
        onMouseEnter={() => {
          hovering.current = true;
          show();
        }}
        onMouseLeave={() => {
          hovering.current = false;
          leave();
        }}
        onFocus={() => {
          focused.current = true;
          show();
        }}
        onBlur={() => {
          focused.current = false;
          leave();
        }}
        onClick={() => {
          if (pinned.current) dismiss();
          else {
            pinned.current = true;
            show();
          }
        }}
      >
        <Info size={17} aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div
            ref={bubble}
            id={id}
            role="tooltip"
            className="info-tip-bubble"
            style={position}
            onMouseEnter={() => {
              hovering.current = true;
              show();
            }}
            onMouseLeave={() => {
              hovering.current = false;
              leave();
            }}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}

export function PageTitle({
  children,
  help,
}: {
  children: ReactNode;
  help?: ReactNode;
}) {
  return (
    <div className="page-title-group">
      <h1>{children}</h1>
      {help && <InfoTip label={`About ${children}`}>{help}</InfoTip>}
    </div>
  );
}

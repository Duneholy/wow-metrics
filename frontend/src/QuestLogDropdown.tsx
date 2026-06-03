import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

export type QuestLogDropdownOption = { value: string; label: string };

export function QuestLogDropdown({
  value,
  options,
  onChange,
  className = "",
  ariaLabel,
  disabled = false,
}: {
  value: string;
  options: QuestLogDropdownOption[];
  onChange: (value: string) => void;
  className?: string;
  ariaLabel?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const portalListRef = useRef<HTMLUListElement | null>(null);

  const updateMenuPosition = () => {
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const maxH = Math.max(80, Math.min(280, window.innerHeight - r.bottom - 12));
    setMenuStyle({
      position: "fixed",
      top: r.bottom + 2,
      left: r.left,
      width: r.width,
      maxHeight: maxH,
      zIndex: 10000,
    });
  };

  useLayoutEffect(() => {
    if (!open) {
      setMenuStyle(null);
      return;
    }
    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [open, value, options.length]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || portalListRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc, true);
    return () => document.removeEventListener("pointerdown", onDoc, true);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const selected = options.find((o) => o.value === value) ?? options[0];
  const display = selected?.label ?? "";

  const listNode =
    open && menuStyle ? (
      <ul
        ref={portalListRef}
        className="quest-log-dropdown-list"
        style={menuStyle}
        role="listbox"
      >
        {options.map((opt) => (
          <li key={opt.value === "" ? "__none" : opt.value} role="presentation">
            <button
              type="button"
              role="option"
              aria-selected={opt.value === value}
              className={`quest-log-dropdown-option${opt.value === value ? " is-selected" : ""}`}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              {opt.label}
            </button>
          </li>
        ))}
      </ul>
    ) : null;

  return (
    <div
      ref={rootRef}
      className={`quest-log-dropdown ${open ? "quest-log-dropdown--open" : ""} ${className}`.trim()}
    >
      <button
        type="button"
        className="quest-log-dropdown-trigger quest-difficulty-select"
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={() => !disabled && setOpen((o) => !o)}
      >
        <span className="quest-log-dropdown-trigger-text">{display}</span>
        <span className="quest-log-dropdown-caret" aria-hidden />
      </button>
      {listNode ? createPortal(listNode, document.body) : null}
    </div>
  );
}

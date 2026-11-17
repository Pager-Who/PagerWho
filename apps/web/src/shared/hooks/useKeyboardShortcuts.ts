import { useEffect, useRef } from "react";

type ShortcutMap = Record<string, () => void>;

// Single-key page shortcuts (e.g. "/" or "j"). Ignored while typing, with modifier keys, or when a modal is open,
// so they never steal input from forms or dialogs.
export function useKeyboardShortcuts(shortcuts: ShortcutMap, enabled = true) {
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    if (!enabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isEditableTarget(event.target) || document.querySelector("[role='dialog'][aria-modal='true']")) return;

      const action = shortcutsRef.current[event.key];
      if (!action) return;

      event.preventDefault();
      action();
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [enabled]);
}

// Moves focus to the next/previous visible focusable item inside a list container, wrapping at neither end.
export function moveListFocus(container: HTMLElement | null, selector: string, direction: 1 | -1) {
  if (!container) return;

  const items = [...container.querySelectorAll<HTMLElement>(selector)].filter((item) => item.offsetParent !== null);
  if (items.length === 0) return;

  const currentIndex = items.indexOf(document.activeElement as HTMLElement);
  const nextIndex = currentIndex < 0
    ? (direction > 0 ? 0 : items.length - 1)
    : Math.min(items.length - 1, Math.max(0, currentIndex + direction));
  const next = items[nextIndex];

  next?.focus();
  next?.scrollIntoView({ block: "nearest" });
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
}

"use client";

import { useRef } from "react";

type Props = {
  size: number;
  revealed?: readonly number[];
  selected?: readonly number[];
  disabled?: boolean;
  onToggle?: (cell: number) => void;
};

export function MemoryGrid({
  size,
  revealed = [],
  selected = [],
  disabled = false,
  onToggle,
}: Props) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const count = size * size;
  const revealedSet = new Set(revealed);
  const selectedSet = new Set(selected);

  function moveFocus(index: number, key: string) {
    const row = Math.floor(index / size);
    const column = index % size;
    let target = index;
    if (key === "ArrowLeft") target = row * size + ((column - 1 + size) % size);
    if (key === "ArrowRight") target = row * size + ((column + 1) % size);
    if (key === "ArrowUp") target = ((row - 1 + size) % size) * size + column;
    if (key === "ArrowDown") target = ((row + 1) % size) * size + column;
    refs.current[target]?.focus();
  }

  return (
    <div
      className="grid w-full max-w-[440px] gap-2 sm:gap-3"
      style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }}
      role="group"
      aria-label={`${size} by ${size} memory grid`}
    >
      {Array.from({ length: count }, (_, cell) => {
        const active = revealedSet.has(cell) || selectedSet.has(cell);
        return (
          <button
            key={cell}
            ref={(element) => {
              refs.current[cell] = element;
            }}
            type="button"
            disabled={disabled}
            aria-label={`Cell ${cell + 1}${selectedSet.has(cell) ? ", selected" : ""}`}
            aria-pressed={selectedSet.has(cell)}
            onClick={() => onToggle?.(cell)}
            onKeyDown={(event) => {
              if (event.key.startsWith("Arrow")) {
                event.preventDefault();
                moveFocus(cell, event.key);
              }
            }}
            className={`relative aspect-square min-h-11 border transition ${
              active
                ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-ink)] shadow-[0_0_20px_rgba(215,255,0,.2)]"
                : "border-[var(--border)] bg-[var(--inset)] text-[var(--border)] hover:border-[var(--muted)]"
            } disabled:cursor-default disabled:hover:border-[var(--border)]`}
          >
            <span className="display text-2xl" aria-hidden="true">
              {selectedSet.has(cell) ? "✓" : active ? "" : "+"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

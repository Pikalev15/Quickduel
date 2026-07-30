import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet" | "danger";
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: Props) {
  const variants = {
    primary:
      "bg-[var(--text)] text-[var(--accent-ink)] border-[var(--text)] hover:bg-[var(--primary-hover)] disabled:bg-[var(--border)] disabled:text-[var(--muted)]",
    secondary:
      "bg-transparent text-[var(--text)] border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent)]",
    quiet:
      "bg-transparent text-[var(--muted)] border-transparent hover:text-[var(--text)]",
    danger:
      "bg-transparent text-[var(--danger)] border-[var(--danger)] hover:bg-[var(--danger)] hover:text-white",
  };
  return (
    <button
      {...props}
      className={`clip-button min-h-12 border px-6 py-3 text-sm font-semibold transition-[transform,background-color,border-color,color] duration-150 disabled:cursor-not-allowed ${variants[variant]} ${className}`}
    />
  );
}

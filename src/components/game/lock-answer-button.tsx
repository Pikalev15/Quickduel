import type { ButtonHTMLAttributes } from "react";

type Props = Pick<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "disabled" | "className"> & {
  label?: string;
  pending?: boolean;
  locked?: boolean;
  remainingMs?: number;
};

/** One immediate action, without a confirmation dialog or delayed submission. */
export function LockAnswerButton({ label = "Lock answer", pending = false, locked = false, remainingMs, className = "", disabled, onClick }: Props) {
  const busy = pending || locked;
  return (
    <button
      type="button"
      className={`answer-lock ${className}`}
      disabled={disabled || busy}
      aria-busy={pending}
      aria-label={busy ? pending ? "Locking answer" : "Answer locked" : label}
      data-state={pending ? "pending" : locked ? "locked" : disabled ? "disabled" : "ready"}
      onClick={onClick}
    >
      <span className="answer-lock-label">
        <span className="answer-lock-icon" aria-hidden="true">
          {pending ? <span className="answer-lock-spinner" /> : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg>
          )}
        </span>
        {pending ? "Locking…" : locked ? "Answer locked" : label}
      </span>
      {remainingMs !== undefined && !busy && <span className="answer-lock-time" aria-hidden="true">{(Math.max(0, remainingMs) / 1000).toFixed(1)}s</span>}
    </button>
  );
}

import type { SVGProps } from "react";

export function LogoMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" {...props}>
      <rect width="64" height="64" rx="14" fill="#3157D5" />
      <path
        d="M29 13C18 13 11 20.5 11 31S18 49 29 49"
        stroke="white"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path
        d="M35 13C46 13 53 20.5 53 31C53 39.2 48.7 45.5 42 48L50 54"
        stroke="white"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

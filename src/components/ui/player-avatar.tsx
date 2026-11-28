"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

export function PlayerAvatar({ name, code, accent = "volt", frame, large = false }: {
  name: string;
  code?: string;
  accent?: string;
  frame?: string;
  large?: boolean;
}) {
  const [revision, setRevision] = useState(0);
  const [failed, setFailed] = useState("");
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener("quickduel:avatar-updated", refresh);
    return () => window.removeEventListener("quickduel:avatar-updated", refresh);
  }, []);
  const src = code && /^[A-F0-9]{6}$/.test(code) ? `/api/avatars/${code}?v=${revision}` : "";
  return (
    <span className={`qd-avatar ${large ? "profile-avatar " : ""}accent-${accent}`} data-profile-frame={frame} data-precision-frame={frame === "frame-precision"} aria-hidden="true">
      {name.slice(0,2).toUpperCase()}
      {src && failed !== src && <Image key={src} src={src} width={192} height={192} alt="" unoptimized onError={() => setFailed(src)} />}
    </span>
  );
}

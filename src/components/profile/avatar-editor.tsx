"use client";

import { useRef, useState } from "react";

export function AvatarEditor() {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function update(file?: File) {
    if (busy) return;
    if (file && (!["image/png","image/jpeg","image/webp"].includes(file.type) || file.size > 2 * 1024 * 1024)) {
      setMessage("Choose a JPEG, PNG or WebP image up to 2 MB.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/profile/avatar", file ? { method: "POST", headers: {"Content-Type": file.type}, body: file } : { method: "DELETE" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error?.message ?? "Could not update avatar.");
      window.dispatchEvent(new Event("quickduel:avatar-updated"));
      setMessage(file ? "Profile icon updated." : "Profile icon removed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update avatar.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  return <div className="qd-avatar-editor">
    <input ref={input} type="file" hidden accept="image/png,image/jpeg,image/webp" aria-label="Choose profile icon" onChange={event => { const file = event.target.files?.[0]; if (file) void update(file); }} />
    <div><button className="calm-secondary" type="button" disabled={busy} onClick={() => input.current?.click()}>{busy ? "Updating…" : "Upload icon"}</button><button className="calm-secondary" type="button" disabled={busy} onClick={() => void update()}>Remove icon</button></div>
    <small>Public player icon. JPEG, PNG or WebP, up to 2 MB. Images are cropped to a square.</small>
    <p role="status">{message}</p>
  </div>;
}

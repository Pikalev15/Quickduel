"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import type { PublicProfile } from "@/types/database";
import { Button } from "@/components/ui/button";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const accents = ["volt", "cyan", "coral", "violet", "white"] as const;

export function ProfileDrawer({
  open,
  profile,
  user,
  onClose,
  onUpdated,
}: {
  open: boolean;
  profile: PublicProfile | null;
  user: User | null;
  onClose: () => void;
  onUpdated: (profile: PublicProfile) => void;
}) {
  const [name, setName] = useState(profile?.display_name ?? "");
  const [accent, setAccent] = useState<PublicProfile["accent_colour"]>(
    profile?.accent_colour ?? "volt",
  );
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [googleAvailable, setGoogleAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/auth/capabilities", { cache: "no-store" })
      .then((response) => response.json())
      .then((body) => {
        if (active) setGoogleAvailable(body.data?.google === true);
      })
      .catch(() => {
        if (active) setGoogleAvailable(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!open) return null;
  const googleConnected = user?.identities?.some((identity) => identity.provider === "google");

  async function save() {
    setSaving(true);
    setMessage(null);
    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ displayName: name, accentColour: accent }),
    });
    const body = await response.json();
    setSaving(false);
    if (!response.ok) {
      setMessage(body.error?.message ?? "Profile update failed.");
      return;
    }
    onUpdated(body.data);
    setMessage("Profile saved.");
  }

  async function connectGoogle() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const options = {
      redirectTo: `${location.origin}/auth/callback?next=/`,
    };
    const { error } = user
      ? await supabase.auth.linkIdentity({ provider: "google", options })
      : await supabase.auth.signInWithOAuth({ provider: "google", options });
    if (error) setMessage(error.message);
  }

  return (
    <div className="profile-overlay" role="presentation" onMouseDown={onClose}>
      <aside
        className="profile-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Customize profile"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="profile-drawer-head">
          <div>
            <p className="game-kicker">Player identity</p>
            <h2 className="display">Profile</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close profile">×</button>
        </div>

        <div className={`profile-avatar accent-${accent}`}>
          {(name || "QD").slice(0, 2).toUpperCase()}
        </div>

        <label className="profile-field">
          <span>Display name</span>
          <input
            value={name}
            minLength={3}
            maxLength={24}
            onChange={(event) => setName(event.target.value)}
            placeholder="RapidFalcon"
          />
          <small>3–24 characters. Letters, numbers, spaces, _ and -.</small>
        </label>

        <fieldset className="accent-picker">
          <legend>Accent colour</legend>
          <div>
            {accents.map((value) => (
              <button
                key={value}
                type="button"
                aria-label={`${value} accent`}
                aria-pressed={accent === value}
                className={`accent-${value}`}
                onClick={() => setAccent(value)}
              />
            ))}
          </div>
        </fieldset>

        {profile && (
          <dl className="profile-stats">
            <div><dt>Rating</dt><dd>{profile.rating}</dd></div>
            <div><dt>Rank</dt><dd>#{profile.rank}</dd></div>
            <div><dt>Wins</dt><dd>{profile.wins}</dd></div>
            <div><dt>Matches</dt><dd>{profile.matches_played}</dd></div>
          </dl>
        )}

        <Button onClick={() => void save()} disabled={saving || !profile}>
          {saving ? "Saving…" : "Save profile"}
        </Button>
        <Button
          variant="secondary"
          onClick={() => void connectGoogle()}
          disabled={googleConnected || googleAvailable !== true}
        >
          {googleConnected
            ? "Google connected"
            : googleAvailable === false
              ? "Google setup required"
              : googleAvailable === null
                ? "Checking Google sign-in…"
                : user?.is_anonymous
                  ? "Protect progress with Google"
                  : "Sign in with Google"}
        </Button>
        <p className="profile-note">
          {googleAvailable === false
            ? "The app is ready, but the project owner must add a Google Client ID and Client Secret in Supabase Auth."
            : googleConnected
            ? "Your rating and customized profile travel with your Google account."
            : "Linking upgrades this exact player account, preserving its rating and match history."}
        </p>
        {message && <p className="profile-message" role="status">{message}</p>}
      </aside>
    </div>
  );
}

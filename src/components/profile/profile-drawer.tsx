"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AccentPicker } from "@/components/theme/accent-picker";
import type { User } from "@supabase/supabase-js";
import type { PublicProfile } from "@/types/database";
import { Button } from "@/components/ui/button";
import { loadSupabaseBrowserClient } from "@/lib/supabase/lazy-client";
import Link from "next/link";
import { getDivision } from "@/lib/divisions";
import { getPlacement } from "@/lib/placements";
import { track } from "@/lib/analytics";

const accents = ["volt", "cyan", "coral", "violet", "white"] as const;

export function ProfileDrawer({
  open,
  profile,
  user,
  onClose,
  onUpdated,
  onSignedOut,
}: {
  open: boolean;
  profile: PublicProfile | null;
  user: User | null;
  onClose: () => void;
  onUpdated: (profile: PublicProfile) => void;
  onSignedOut: () => void;
}) {
  const router = useRouter();
  const [authBusy, setAuthBusy] = useState(false);
  const [confirm, setConfirm] = useState<"signin" | "signout" | null>(null);
  const placement = getPlacement(profile?.matches_played);
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

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose, open]);

  if (!open) return null;
  const googleConnected = user?.identities?.some((identity) => identity.provider === "google");

  async function save() {
    setSaving(true);
    setMessage(null);
    if (!profile) {
      const supabase = await loadSupabaseBrowserClient();
      if (!supabase) {
        setSaving(false);
        setMessage("Profile creation needs Supabase configuration.");
        return;
      }
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        const { error } = await supabase.auth.signInAnonymously();
        if (error) {
          setSaving(false);
          setMessage("Could not create your player account. Please try again.");
          return;
        }
      }
      const { error } = await supabase.rpc("ensure_profile");
      if (error) {
        setSaving(false);
        setMessage("Could not create your player profile. Please try again.");
        return;
      }
    }
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

  async function authenticate(intent: "signin" | "signup") {
    if (user?.is_anonymous && intent === "signin" && confirm !== "signin") {
      setConfirm("signin");
      setMessage("Signing in switches accounts. Choose Sign up to keep this guest profile.");
      return;
    }
    setAuthBusy(true);
    setMessage(null);
    try {
      const supabase = await loadSupabaseBrowserClient();
      if (!supabase) throw new Error("Google sign-in is unavailable.");
      const options = { redirectTo: `${location.origin}/auth/callback?next=/` };
      if (intent === "signup") {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          const { error } = await supabase.auth.signInAnonymously();
          if (error) throw error;
        }
        const { error } = await supabase.auth.linkIdentity({ provider: "google", options });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options });
        if (error) throw error;
      }
      track("google_account_linked");
    } catch {
      setMessage("Could not open Google sign-in. Please try again.");
    } finally { setAuthBusy(false); }
  }

  async function signOut() {
    if (user?.is_anonymous && confirm !== "signout") {
      setConfirm("signout");
      setMessage("Ending this guest session may permanently lose your guest progress. Link Google first to keep it.");
      return;
    }
    setAuthBusy(true);
    try {
      const supabase = await loadSupabaseBrowserClient();
      if (!supabase) throw new Error("Sign-out unavailable.");
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;
      onSignedOut();
      router.refresh();
    } catch { setMessage("Could not sign out. Please try again."); }
    finally { setAuthBusy(false); }
  }

  return createPortal(
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

        <div className={`profile-avatar accent-${accent}`} data-profile-frame={profile?.equipped_cosmetics?.profile_frame ?? undefined}>
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
          <legend>Avatar colour</legend>
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
          <>
          <div className="profile-public-code">
            <small>Player code</small>
            <strong>{profile.display_name}#{profile.public_code ?? "–"}</strong>
          </div>
          <dl className="profile-stats">
            <div><dt>Rating</dt><dd>{placement?.placed ? profile.rating : "Unranked"}</dd><small>{placement?.placed ? getDivision(profile.rating).name : placement ? `${placement.completed}/${placement.required} placements` : "Rank pending"}</small></div>
            <div><dt>Rank</dt><dd>{placement?.placed ? `#${profile.rank}` : "–"}</dd></div>
            <div><dt>Wins</dt><dd>{profile.wins}</dd></div>
            <div><dt>Matches</dt><dd>{profile.matches_played}</dd></div>
          </dl>
          <nav className="profile-links">
            <Link href="/profile/stats">Personal statistics</Link>
            <Link href="/history">Match history</Link>
            <Link href="/profile/settings">Account and cosmetics</Link>
          </nav>
          </>
        )}

        <Button
          onClick={() => void save()}
          disabled={saving || name.trim().length < 3}
        >
          {saving ? "Saving…" : profile ? "Save profile" : "Create profile"}
        </Button>
        <AccentPicker />
        <section className="qd-profile-account">
          <h3>Account</h3>
          <p>{user?.email ?? (user?.is_anonymous ? "Guest account" : "Not signed in")}</p>
          {!googleConnected && <>
            <Button variant="secondary" disabled={authBusy || googleAvailable !== true} onClick={() => void authenticate("signin")}>{confirm === "signin" ? "Confirm sign in" : "Sign in with Google"}</Button>
            <Button variant="secondary" disabled={authBusy || googleAvailable !== true} onClick={() => void authenticate("signup")}>{user?.is_anonymous ? "Sign up and keep progress" : "Sign up with Google"}</Button>
            {googleAvailable === false && <p>Google sign-in is unavailable.</p>}
          </>}
          {user && <Button variant="secondary" disabled={authBusy} onClick={() => void signOut()}>{user.is_anonymous ? confirm === "signout" ? "Confirm end session" : "End guest session" : "Sign out"}</Button>}
        </section>
        {message && <p className="profile-message" role="status">{message}</p>}
      </aside>
    </div>, document.body
  );
}

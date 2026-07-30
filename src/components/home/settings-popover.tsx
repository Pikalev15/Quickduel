"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { SettingsIcon } from "@/components/ui/icons";
import type { PublicProfile } from "@/types/database";
import {
  useTheme,
  type ThemePreference,
} from "@/components/theme/theme-provider";

export type HomePreferences = {
  showGameLibrary: boolean;
  showLeaderboardPreview: boolean;
  showHowItWorks: boolean;
};

export type AuthIntent = "signin" | "signup";

export function SettingsPopover({
  open,
  preferences,
  profile,
  user,
  onOpenChange,
  onChange,
  onOpenProfile,
  onReset,
  onAuthenticate,
  onSignOut,
}: {
  open: boolean;
  preferences: HomePreferences;
  profile: PublicProfile | null;
  user: User | null;
  onOpenChange: (open: boolean) => void;
  onChange: (preferences: HomePreferences) => void;
  onOpenProfile: () => void;
  onReset: () => void;
  onAuthenticate: (intent: AuthIntent) => Promise<string | null>;
  onSignOut: () => Promise<string | null>;
}) {
  const wrapper = useRef<HTMLDivElement>(null);
  const { preference, resolvedTheme, setPreference } = useTheme();
  const [feedback, setFeedback] = useState<string | null>(null);
  const [confirmGuestExit, setConfirmGuestExit] = useState(false);
  const [confirmGuestLogin, setConfirmGuestLogin] = useState(false);
  const [authenticating, setAuthenticating] = useState<AuthIntent | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) {
        setFeedback(null);
        setConfirmGuestExit(false);
        setConfirmGuestLogin(false);
        onOpenChange(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [onOpenChange, open]);

  function togglePopover() {
    if (open) {
      setFeedback(null);
      setConfirmGuestExit(false);
      setConfirmGuestLogin(false);
    }
    onOpenChange(!open);
  }

  function openProfile() {
    setFeedback(null);
    setConfirmGuestExit(false);
    setConfirmGuestLogin(false);
    onOpenProfile();
  }

  const toggle = (key: keyof HomePreferences) =>
    onChange({ ...preferences, [key]: !preferences[key] });

  const isGuest = user?.is_anonymous === true;
  const googleConnected = user?.identities?.some(
    (identity) => identity.provider === "google",
  );
  const accountName =
    profile?.display_name ??
    user?.email ??
    (isGuest ? "Guest player" : user ? "QuickDuel player" : "No player session");
  const accountDetail = googleConnected
    ? user?.email ?? "Google account connected"
    : isGuest
      ? "Sign up to keep this guest, or sign in to switch accounts."
      : "Sign in to an existing account or create a new one.";

  async function authenticate(intent: AuthIntent) {
    if (intent === "signin" && isGuest && !confirmGuestLogin) {
      setConfirmGuestLogin(true);
      setConfirmGuestExit(false);
      setFeedback(
        "Signing in switches to your existing account. Choose Sign up if you want to keep this guest profile.",
      );
      return;
    }
    setAuthenticating(intent);
    setFeedback(null);
    const message = await onAuthenticate(intent);
    setAuthenticating(null);
    if (message) setFeedback(message);
  }

  async function signOut() {
    if (isGuest && !confirmGuestExit) {
      setConfirmGuestExit(true);
      setConfirmGuestLogin(false);
      setFeedback("Guest progress cannot be recovered after ending this session unless it is linked to Google.");
      return;
    }
    setSigningOut(true);
    setFeedback(null);
    const message = await onSignOut();
    setSigningOut(false);
    if (message) setFeedback(message);
  }

  function resetInterface() {
    onReset();
    setPreference("light");
    setFeedback("Interface settings reset.");
  }

  return (
    <div className="settings-anchor" ref={wrapper}>
      <button
        type="button"
        className="icon-button settings-trigger"
        aria-label="Settings"
        aria-expanded={open}
        onClick={togglePopover}
      >
        <SettingsIcon className="h-5 w-5" />
        <span>Settings</span>
      </button>
      {open && (
        <section className="settings-popover" aria-label="Settings">
          <div className="settings-popover-head">
            <strong>Settings</strong>
            <span>Account, appearance, and home screen.</span>
          </div>
          <div className="settings-account">
            <span className={`settings-avatar accent-${profile?.accent_colour ?? "volt"}`}>
              {(profile?.display_name ?? "QD").slice(0, 2).toUpperCase()}
            </span>
            <span>
              <strong>{accountName}</strong>
              <small>{accountDetail}</small>
            </span>
          </div>
          <div className="settings-actions">
            {!user ? (
              <>
                <button
                  type="button"
                  disabled={authenticating !== null}
                  onClick={() => void authenticate("signin")}
                >
                  {authenticating === "signin" ? "Opening Google…" : "Sign in"}
                </button>
                <button
                  type="button"
                  disabled={authenticating !== null}
                  onClick={() => void authenticate("signup")}
                >
                  {authenticating === "signup" ? "Opening Google…" : "Sign up"}
                </button>
                <button
                  type="button"
                  className="settings-wide-action"
                  onClick={openProfile}
                >
                  Continue as guest
                </button>
              </>
            ) : isGuest ? (
              <>
                <button
                  type="button"
                  disabled={authenticating !== null}
                  onClick={() => void authenticate("signup")}
                >
                  {authenticating === "signup" ? "Opening Google…" : "Sign up"}
                </button>
                <button
                  type="button"
                  disabled={authenticating !== null}
                  onClick={() => void authenticate("signin")}
                >
                  {authenticating === "signin"
                    ? "Opening Google…"
                    : confirmGuestLogin
                      ? "Confirm sign in"
                      : "Sign in"}
                </button>
              </>
            ) : (
              <button type="button" onClick={openProfile}>
                Manage profile
              </button>
            )}
            {user && !isGuest && (
              <button
                type="button"
                className="settings-danger"
                disabled={signingOut}
                onClick={() => void signOut()}
              >
                {signingOut
                  ? "Signing out…"
                  : "Sign out"}
              </button>
            )}
            {isGuest && (
              <button
                type="button"
                className="settings-danger settings-wide-action"
                disabled={signingOut}
                onClick={() => void signOut()}
              >
                {signingOut
                  ? "Ending session…"
                  : confirmGuestExit
                    ? "Confirm end session"
                    : "End guest session"}
              </button>
            )}
          </div>
          {feedback && <p className="settings-feedback" role="status">{feedback}</p>}
          <div className="settings-section-label">Home screen</div>
          <PreferenceToggle
            label="Show game library"
            help="Keep all twelve games expanded on the home screen."
            checked={preferences.showGameLibrary}
            onChange={() => toggle("showGameLibrary")}
          />
          <PreferenceToggle
            label="Leaderboard preview"
            help="Show the top players below Quick Play."
            checked={preferences.showLeaderboardPreview}
            onChange={() => toggle("showLeaderboardPreview")}
          />
          <PreferenceToggle
            label="How it works"
            help="Show the three-step QuickDuel explanation."
            checked={preferences.showHowItWorks}
            onChange={() => toggle("showHowItWorks")}
          />
          <div className="theme-picker">
            <div>
              <strong>Theme</strong>
              <small>
                {preference === "system"
                  ? `Following system · ${resolvedTheme}`
                  : `${preference[0].toUpperCase()}${preference.slice(1)} appearance`}
              </small>
            </div>
            <div className="theme-options" aria-label="Theme" role="group">
              {(["light", "dark", "system"] as ThemePreference[]).map((theme) => (
                <button
                  type="button"
                  key={theme}
                  aria-pressed={preference === theme}
                  onClick={() => setPreference(theme)}
                >
                  {theme === "system" ? "Auto" : `${theme[0].toUpperCase()}${theme.slice(1)}`}
                </button>
              ))}
            </div>
          </div>
          <button type="button" className="settings-reset" onClick={resetInterface}>
            Reset interface
          </button>
        </section>
      )}
    </div>
  );
}

function PreferenceToggle({
  label,
  help,
  checked,
  onChange,
}: {
  label: string;
  help: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      className="preference-toggle"
      aria-pressed={checked}
      onClick={onChange}
    >
      <span>
        <strong>{label}</strong>
        <small>{help}</small>
      </span>
      <i aria-hidden="true" data-checked={checked} />
    </button>
  );
}

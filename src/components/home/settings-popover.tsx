"use client";

import { useEffect, useRef, useState } from "react";
import { SettingsIcon } from "@/components/ui/icons";
import { AccentPicker } from "@/components/theme/accent-picker";
import {
  useTheme,
  type ThemePreference,
} from "@/components/theme/theme-provider";

export type HomePreferences = {
  showGameLibrary: boolean;
  showLeaderboardPreview: boolean;
  showHowItWorks: boolean;
};

export function SettingsPopover({
  open,
  preferences,
  onOpenChange,
  onChange,
  onReset,
}: {
  open: boolean;
  preferences: HomePreferences;
  onOpenChange: (open: boolean) => void;
  onChange: (preferences: HomePreferences) => void;
  onReset: () => void;
}) {
  const wrapper = useRef<HTMLDivElement>(null);
  const { preference, resolvedTheme, setPreference, setAccent } = useTheme();
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) {
        setFeedback(null);
        onOpenChange(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [onOpenChange, open]);

  function togglePopover() {
    if (open) {
      setFeedback(null);
    }
    onOpenChange(!open);
  }

  const toggle = (key: keyof HomePreferences) =>
    onChange({ ...preferences, [key]: !preferences[key] });

  function resetInterface() {
    onReset();
    setPreference("light");
    setAccent("blue");
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
            <span>Appearance and home screen.</span>
          </div>
          {feedback && <p className="settings-feedback" role="status">{feedback}</p>}
          <div className="settings-section-label">Home screen</div>
          <PreferenceToggle
            label="Show game library"
            help="Expand the game library on the home screen."
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
            help="Show how matches work."
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
          <AccentPicker />
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

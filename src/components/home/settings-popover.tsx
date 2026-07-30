"use client";

import { useEffect, useRef } from "react";
import { SettingsIcon } from "@/components/ui/icons";

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
}: {
  open: boolean;
  preferences: HomePreferences;
  onOpenChange: (open: boolean) => void;
  onChange: (preferences: HomePreferences) => void;
}) {
  const wrapper = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) onOpenChange(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [onOpenChange, open]);

  const toggle = (key: keyof HomePreferences) =>
    onChange({ ...preferences, [key]: !preferences[key] });

  return (
    <div className="settings-anchor" ref={wrapper}>
      <button
        type="button"
        className="icon-button"
        aria-label="Interface settings"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
      >
        <SettingsIcon className="h-5 w-5" />
      </button>
      {open && (
        <section className="settings-popover" aria-label="Interface settings">
          <div className="settings-popover-head">
            <strong>Interface</strong>
            <span>Choose what stays visible.</span>
          </div>
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
          <div className="theme-readout">
            <span><i /> Theme</span>
            <strong>Calm light</strong>
          </div>
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
    <button type="button" className="preference-toggle" onClick={onChange}>
      <span>
        <strong>{label}</strong>
        <small>{help}</small>
      </span>
      <i aria-hidden="true" data-checked={checked} />
    </button>
  );
}

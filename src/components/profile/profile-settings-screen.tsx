"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ProductHeader } from "@/components/ui/product-header";

type Cosmetic = {
  id: string;
  type: string;
  name: string;
  configuration: Record<string, unknown>;
  owned: boolean;
  equipped: boolean;
};

export function ProfileSettingsScreen() {
  const router = useRouter();
  const [cosmetics, setCosmetics] = useState<Cosmetic[]>([]);
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function loadCosmetics() {
    const response = await fetch("/api/cosmetics", { cache: "no-store" });
    const body = await response.json();
    if (response.ok) setCosmetics(body.data ?? []);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void loadCosmetics(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function equip(cosmeticId: string) {
    const response = await fetch("/api/cosmetics", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cosmeticId }),
    });
    const body = await response.json();
    if (!response.ok) {
      setMessage(body.error?.message ?? "Could not equip cosmetic.");
      return;
    }
    setCosmetics(body.data ?? []);
    setMessage("Cosmetic equipped.");
  }

  async function resetOnboarding() {
    const response = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completed: false, skipped: false, recommendation: null }),
    });
    if (response.ok) router.push("/onboarding");
    else setMessage("Could not reset the starter sequence.");
  }

  async function deleteAccount() {
    if (confirmation !== "DELETE") return;
    setDeleting(true);
    const response = await fetch("/api/account/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmation }),
    });
    const body = await response.json();
    if (!response.ok) {
      setMessage(body.error?.message ?? "Account deletion failed.");
      setDeleting(false);
      return;
    }
    router.replace("/");
    router.refresh();
  }

  const grouped = Object.groupBy(cosmetics, (cosmetic) => cosmetic.type);

  return (
    <main className="min-h-screen">
      <ProductHeader current="profile" />
      <section className="page-shell feature-shell">
        <div className="feature-heading">
          <p className="calm-eyebrow">Profile settings</p>
          <h1>Account and cosmetics</h1>
          <p>Cosmetics change presentation only. They never affect score, matchmaking, or Elo.</p>
        </div>
        {message && <p className="profile-message" role="status">{message}</p>}

        <section className="settings-section">
          <div className="feature-section-heading"><div><h2>Owned cosmetics</h2><p>Free testing items are available now; there is no shop or payment flow.</p></div></div>
          <div className="cosmetic-groups">
            {Object.entries(grouped).map(([type, items]) => (
              <fieldset key={type}>
                <legend>{type.replaceAll("_", " ")}</legend>
                {(items ?? []).map((cosmetic) => (
                  <button key={cosmetic.id} type="button" disabled={!cosmetic.owned} aria-pressed={cosmetic.equipped} onClick={() => void equip(cosmetic.id)}>
                    <span>{cosmetic.name}</span><small>{cosmetic.equipped ? "Equipped" : cosmetic.owned ? "Owned" : "Locked"}</small>
                  </button>
                ))}
              </fieldset>
            ))}
          </div>
        </section>

        <section className="settings-section">
          <div className="feature-section-heading"><div><h2>Starter sequence</h2><p>Replay the unranked three-game introduction and replace your playlist suggestion.</p></div></div>
          <button className="calm-secondary" type="button" onClick={() => void resetOnboarding()}>Reset onboarding</button>
        </section>

        <section className="settings-section danger-zone">
          <div className="feature-section-heading"><div><h2>Delete account</h2><p>Your personal profile is anonymised, social relationships and invitations are removed, and sign-in is disabled. Aggregate match integrity is preserved.</p></div></div>
          <label>Type DELETE to confirm<input value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /></label>
          <button className="danger-button" type="button" disabled={confirmation !== "DELETE" || deleting} onClick={() => void deleteAccount()}>{deleting ? "Deleting…" : "Delete my account"}</button>
        </section>
      </section>
    </main>
  );
}

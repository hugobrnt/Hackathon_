import { useState, type FormEvent } from "react";
import { Button, Heading } from "../../shared/ui";
import { safeExternalUrl } from "../../shared/storage";
export interface BrandProfile {
  name: string;
  website: string;
  offer: string;
  audience: string;
  goal: string;
  tone: string;
}
export const emptyProfile: BrandProfile = {
  name: "",
  website: "",
  offer: "",
  audience: "",
  goal: "Meaningful engagement",
  tone: "Friendly and concise",
};
export const lingoProfile: BrandProfile = {
  name: "Lingo",
  website: "https://lingo.example",
  offer: "An AI coach to practice spoken English for job interviews.",
  audience: "Young professionals preparing for interviews in English.",
  goal: "Meaningful engagement",
  tone: "Friendly and concise",
};
export function Profile({
  initial,
  onSave,
  onSkip,
  onboarding = false,
}: {
  initial: BrandProfile;
  onSave: (p: BrandProfile) => void;
  onSkip?: () => void;
  onboarding?: boolean;
}) {
  const [form, setForm] = useState(initial),
    [error, setError] = useState("");
  const update = (key: keyof BrandProfile, value: string) =>
    setForm((p) => ({ ...p, [key]: value }));
  function submit(e: FormEvent) {
    e.preventDefault();
    if (form.website && !safeExternalUrl(form.website)) {
      setError("Use a complete http:// or https:// website address.");
      return;
    }
    setError("");
    onSave(form);
  }
  return (
    <>
      <Heading
        title={
          onboarding ? "Tell us about your brand. (Optional)" : "Enrich profile"
        }
        subtitle={
          onboarding
            ? "Skip this for now. You can add context later."
            : "Keep your offer, audience and brand voice in one place."
        }
      />
      <form className="profile-form" onSubmit={submit}>
        <div className="form-columns">
          <label className="field">
            Brand name
            <input
              maxLength={80}
              value={form.name}
              placeholder="Your brand"
              onChange={(e) => update("name", e.target.value)}
            />
          </label>
          <label className="field">
            Website · optional
            <input
              type="url"
              maxLength={1000}
              placeholder="https://yourbrand.com"
              value={form.website}
              onChange={(e) => update("website", e.target.value)}
            />
          </label>
        </div>
        <label className="field">
          Your offer
          <textarea
            rows={3}
            maxLength={2000}
            placeholder="What do you help people do?"
            value={form.offer}
            onChange={(e) => update("offer", e.target.value)}
          />
        </label>
        <label className="field">
          Your audience
          <input
            maxLength={500}
            placeholder="Who is your product for?"
            value={form.audience}
            onChange={(e) => update("audience", e.target.value)}
          />
        </label>
        <p className="footnote">
          Manage your offer and reply preferences in Conversations → Reply
          settings.
        </p>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        <div className="actions">
          <Button type="submit" primary>
            {onboarding ? "Choose my channels" : "Save profile"}
          </Button>
          {onSkip && (
            <Button onClick={onSkip} className="btn--ghost">
              Skip for now
            </Button>
          )}
        </div>
      </form>
    </>
  );
}

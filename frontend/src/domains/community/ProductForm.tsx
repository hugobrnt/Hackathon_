import { useState, type FormEvent } from "react";
import type { Product, ProductInput } from "../../api/outreach-types";
import { Button } from "../../shared/ui";
import { safeExternalUrl } from "../../shared/storage";
export const defaultProduct: ProductInput = {
  business_type: "saas",
  name: "Lingo",
  landing_url: "https://lingo.example",
  description:
    "Lingo is an AI English coach for interview practice. Practice realistic conversations, get personal feedback and try a free session.",
};
export function ProductForm({
  product,
  busy,
  onSave,
  demo = false,
}: {
  product: ProductInput | Product | null;
  busy: boolean;
  onSave: (v: ProductInput) => void;
  demo?: boolean;
}) {
  const [form, setForm] = useState<ProductInput>(
      product ?? {
        business_type: "saas",
        name: "",
        landing_url: "",
        description: "",
      },
    ),
    [error, setError] = useState("");
  function submit(e: FormEvent) {
    e.preventDefault();
    if (
      !safeExternalUrl(form.landing_url) ||
      form.description.trim().length < 20 ||
      !form.name.trim()
    ) {
      setError(
        "Add a product name, a valid website and at least 20 characters of product facts.",
      );
      return;
    }
    setError("");
    onSave({
      ...form,
      name: form.name.trim(),
      description: form.description.trim(),
    });
  }
  return (
    <form onSubmit={submit} className="product-form">
      <div className="form-columns">
        <label className="field">
          Business type
          <select
            value={form.business_type}
            onChange={(e) =>
              setForm({
                ...form,
                business_type: e.target.value as ProductInput["business_type"],
              })
            }
          >
            <option value="saas">SaaS</option>
            <option value="ecommerce">E-commerce</option>
          </select>
        </label>
        <label className="field">
          Product name
          <input
            required
            maxLength={100}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
      </div>
      <label className="field">
        Product page
        <input
          type="url"
          required
          value={form.landing_url}
          onChange={(e) => setForm({ ...form, landing_url: e.target.value })}
          placeholder="https://yourproduct.com"
        />
      </label>
      <label className="field">
        Facts the agent can use
        <textarea
          required
          minLength={20}
          maxLength={2000}
          rows={4}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="What it does, pricing, free trial, limitations…"
        />
      </label>
      <p className="footnote">
        These facts and the post caption inform generated DMs.{" "}
        {demo
          ? "Saved only in this demo."
          : "Saved to every connected channel for this brand."}
      </p>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <Button primary type="submit" disabled={busy}>
        {busy ? "Saving…" : "Save product"}
      </Button>
    </form>
  );
}

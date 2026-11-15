import { useState } from "react";
import type { ProductInput } from "../../api/outreach-types";
import { ProductForm } from "../community/ProductForm";
import { Button } from "../../shared/ui";
import "./products.css";
export function DraftCatalog({
  products,
  onChange,
  busy = false,
}: {
  products: ProductInput[];
  onChange: (p: ProductInput[]) => void;
  busy?: boolean;
}) {
  const [editing, setEditing] = useState<number | null>(null);
  return (
    <div className="draft-catalog">
      {products.map((p, i) => (
        <div className="catalog-draft-row" key={i}>
          <div>
            <strong>{p.name}</strong>
            <span>{p.landing_url}</span>
          </div>
          <Button disabled={busy} onClick={() => setEditing(i)}>
            Edit
          </Button>
          <Button
            disabled={busy}
            aria-label={"Remove " + p.name}
            onClick={() => onChange(products.filter((_, j) => j !== i))}
          >
            Remove
          </Button>
        </div>
      ))}
      {editing !== null ? (
        <section className="panel">
          <h2>{editing === -1 ? "Add a product" : "Edit product"}</h2>
          <ProductForm
            key={editing}
            product={products[editing] ?? null}
            busy={busy}
            submitLabel="Save product"
            onSave={(p) => {
              onChange(
                editing === -1
                  ? [...products, p]
                  : products.map((v, i) => (i === editing ? p : v)),
              );
              setEditing(null);
            }}
          />
          <Button onClick={() => setEditing(null)}>Cancel</Button>
        </section>
      ) : (
        <Button onClick={() => setEditing(-1)} disabled={busy}>
          + Add a product
        </Button>
      )}
    </div>
  );
}

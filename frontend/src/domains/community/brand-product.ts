import type { OutreachSource } from "../../api/outreach";
import type { ProductInput, Product } from "../../api/outreach-types";
export function productsDiffer(products: (Product | null)[]) {
  const known = products.filter((p): p is Product => p !== null);
  if (!known.length) return false;
  const facts = (p: Product) =>
    JSON.stringify([p.business_type, p.name, p.landing_url, p.description]);
  return (
    known.length !== products.length ||
    known.some((p) => facts(p) !== facts(known[0]))
  );
}
export async function saveBrandProduct(
  source: OutreachSource,
  accounts: string[],
  input: ProductInput,
) {
  const unique = [...new Set(accounts)];
  const result = await Promise.allSettled(
    unique.map((id) => source.saveProduct(id, input)),
  );
  const failed = result.flatMap((r, i) =>
    r.status === "rejected" ? [unique[i]] : [],
  );
  if (failed.length)
    throw new Error(
      "Product saved on " +
        (unique.length - failed.length) +
        "/" +
        unique.length +
        " channels. Retry to sync: " +
        failed.join(", ") +
        ".",
    );
  return unique.length;
}

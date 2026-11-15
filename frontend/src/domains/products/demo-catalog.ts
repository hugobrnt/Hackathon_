import { readStored, saveStored } from "../../shared/storage.ts";
import type { CatalogInput, CatalogProduct } from "./types";
const key = (account: string) => "signal:demo:catalog:v1:" + account;
export const demoCatalogInputs: CatalogInput[] = [
  {
    business_type: "saas",
    title: "Lingo Interview",
    landing_url: "https://lingo.example/interview",
    description:
      "Prepare English job interviews with realistic role plays and personal feedback. Includes a free practice session. Designed for professionals preparing for an interview.",
    is_active: true,
  },
  {
    business_type: "saas",
    title: "Lingo Daily",
    landing_url: "https://lingo.example/daily",
    description:
      "Practice everyday English in ten-minute conversations. Build confidence and vocabulary with daily exercises. Includes a free trial for new learners.",
    is_active: true,
  },
];
function base(account: string) {
  return (
    [...account].reduce((n, c) => (n * 31 + c.charCodeAt(0)) >>> 0, 0) * 1000
  );
}
export function readDemoCatalog(account: string): CatalogProduct[] {
  const saved = readStored<CatalogProduct[] | null>(key(account), null);
  if (Array.isArray(saved)) return saved;
  return demoCatalogInputs.map((p, i) => ({
    ...p,
    id: base(account) + i + 1,
    account_id: account,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));
}
export function writeDemoProduct(
  account: string,
  input: CatalogInput,
  id?: number,
): CatalogProduct {
  const all = readDemoCatalog(account);
  const old = all.find((p) => p.id === id);
  if (id !== undefined && !old)
    throw new Error("Product not found on this channel.");
  const product = {
    ...input,
    id: old?.id ?? Math.max(base(account), ...all.map((p) => p.id)) + 1,
    account_id: account,
    created_at: old?.created_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  saveStored(key(account), [
    ...all.filter((p) => p.id !== product.id),
    product,
  ]);
  return product;
}
export function replaceDemoCatalog(account: string, inputs: CatalogInput[]) {
  saveStored(
    key(account),
    inputs.map((p, i) => ({
      ...p,
      id: base(account) + i + 1,
      account_id: account,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })),
  );
}
/** Illustrative matches for the offline dataset; never used for live messages. */
export function demoProductMatch(
  account: string,
  text: string,
  caption: string,
) {
  const products = readDemoCatalog(account).filter((p) => p.is_active);
  if (products.length === 1)
    return {
      product_id: products[0].id,
      product_title: products[0].title,
      product_confidence: 1,
    };
  const words = (text + " " + caption).toLowerCase();
  const p =
    products.find(
      (p) => /interview/i.test(p.title) && words.includes("interview"),
    ) ??
    products.find(
      (p) =>
        /daily/i.test(p.title) &&
        /daily|everyday|10 minutes|ten.minute/.test(words),
    );
  return {
    product_id: p?.id ?? null,
    product_title: p?.title ?? null,
    product_confidence: p ? 0.92 : 0.35,
  };
}

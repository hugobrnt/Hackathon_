import { request } from "../../api/client.ts";
import type { DataMode } from "../../api/source";
import type { CatalogInput, CatalogProduct } from "./types";
import { readDemoCatalog, writeDemoProduct } from "./demo-catalog.ts";
export function catalogFor(mode: DataMode) {
  return {
    list: (account: string, signal?: AbortSignal): Promise<CatalogProduct[]> =>
      mode === "demo"
        ? Promise.resolve(readDemoCatalog(account))
        : request("/accounts/" + encodeURIComponent(account) + "/products", {
            signal,
          }),
    save: (
      account: string,
      input: CatalogInput,
      id?: number,
    ): Promise<CatalogProduct> =>
      mode === "demo"
        ? Promise.resolve(writeDemoProduct(account, input, id))
        : request(
            id
              ? "/products/" + id
              : "/accounts/" + encodeURIComponent(account) + "/products",
            { method: id ? "PUT" : "POST", body: JSON.stringify(input) },
          ),
  };
}
export function groupCatalog(products: CatalogProduct[]) {
  const groups = new Map<string, CatalogProduct[]>();
  for (const p of products) {
    const k = p.landing_url;
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  return [...groups.values()];
}
/** Retry-safe upsert: an interrupted channel sync does not create duplicate links. */
export async function saveCatalogAcrossChannels(
  mode: DataMode,
  accounts: string[],
  input: CatalogInput,
  existing: CatalogProduct[] = [],
) {
  const source = catalogFor(mode);
  const results = await Promise.allSettled(
    [...new Set(accounts)].map(async (account) => {
      const old =
        existing.find((p) => p.account_id === account) ??
        (await source.list(account)).find(
          (p) => p.landing_url === input.landing_url,
        );
      return source.save(account, input, old?.id);
    }),
  );
  const failures = results.flatMap((r, i) =>
    r.status === "rejected"
      ? [
          accounts[i] +
            ": " +
            (r.reason instanceof Error ? r.reason.message : "Save failed"),
        ]
      : [],
  );
  if (failures.length)
    throw new Error(
      `Saved on ${results.length - failures.length}/${results.length} channels. Retry: ${failures.join(" · ")}`,
    );
}

export interface CatalogInput {
  business_type: "saas" | "ecommerce";
  title: string;
  landing_url: string;
  description: string;
  is_active: boolean;
}
export interface CatalogProduct extends CatalogInput {
  id: number;
  account_id: string;
  created_at: string;
  updated_at: string;
}

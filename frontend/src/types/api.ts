export interface HealthResponse {
  status: "ok";
  service: string;
  version: string;
}

export type CanonicalLabelField =
  | "brand_name"
  | "class_type"
  | "abv"
  | "net_contents"
  | "producer"
  | "country_of_origin"
  | "government_warning";

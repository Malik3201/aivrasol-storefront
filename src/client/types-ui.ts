import type {
  PublicSellingUnitOption,
  PublicStorefrontProduct,
} from "../shared/types";

export type StorefrontView =
  | "home"
  | "shop"
  | "product"
  | "cart"
  | "checkout"
  | "track"
  | "doctors"
  | "services"
  | "about"
  | "branches"
  | "delivery"
  | "hours"
  | "contact"
  | "privacy"
  | "terms";

export interface ResolvedSellingUnit extends PublicSellingUnitOption {
  unit_id: string;
  unit_name: string;
}

export interface CartItem {
  cartKey: string;
  product: PublicStorefrontProduct;
  selectedUnit: ResolvedSellingUnit;
  qty: number;
}


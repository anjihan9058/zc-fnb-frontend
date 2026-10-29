import type { Receipt } from './types';

export interface RecipeIngredient {
  id: string;
  product_id: string;
  quantity: number | null;
  unit: string;
}
export interface MenuRecipe {
  id: string;
  name: string;
  selling_price: number | null;
  version: number;
  ingredients: RecipeIngredient[];
}
export interface CostIngredient extends RecipeIngredient {
  name: string;
  unit_price: number | null;
  previous_unit_price: number | null;
  line_cost: number | null;
  purchased_at: string | null;
  supplier: string | null;
  receipt_id?: string;
  purchase_unit?: string;
  purchase_unit_price?: number;
  quantity_in_purchase_unit?: number;
}
export interface MenuCost {
  menu: MenuRecipe;
  ingredients: CostIngredient[];
  issues: string[];
  ingredient_cost: number | null;
  previous_ingredient_cost: number | null;
  cost_rate: number | null;
  margin_rate: number | null;
  margin_amount: number | null;
  price_change_amount: number | null;
  calculated_at: string;
}
export interface ReceivingLine {
  item_id: string;
  name: string;
  unit: string;
  expected_quantity: number | null;
  actual_quantity: number | null;
  wrong_item: boolean;
  note: string;
}
export type ReceivingStatus = 'PENDING' | 'NORMAL' | 'SHORTAGE' | 'WRONG_ITEM' | 'COMPLETED';
export interface ReceivingDocument {
  receipt_id: string;
  version: number;
  supplier: string;
  received_on: string;
  receipt_status: Receipt['status'];
  status: ReceivingStatus;
  lines: ReceivingLine[];
  checked_by: string;
  checked_at: string | null;
  completed: boolean;
}
export interface OperationsApi {
  menus(): Promise<MenuCost[]>;
  saveMenu(menu: MenuRecipe): Promise<MenuRecipe>;
  deleteMenu(id: string, version: number): Promise<void>;
  receiving(): Promise<ReceivingDocument[]>;
  saveReceiving(doc: ReceivingDocument): Promise<ReceivingDocument>;
}
export const receivingLabels: Record<ReceivingStatus, string> = {
  PENDING: '검수 대기',
  NORMAL: '정상 입고',
  SHORTAGE: '일부 누락',
  WRONG_ITEM: '오배송',
  COMPLETED: '검수 완료',
};

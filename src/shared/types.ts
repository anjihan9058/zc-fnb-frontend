export type ReceiptStatus =
  'UPLOADED' | 'PROCESSING' | 'NEEDS_REVIEW' | 'READY_TO_APPROVE' | 'APPROVED' | 'FAILED';
export type UploadMode = 'AUTO' | 'HANDWRITTEN' | 'PRINTED' | 'DIGITAL';
export type ReceiptFormat = Exclude<UploadMode, 'AUTO'>;
export type UploadDocumentType = 'RECEIPT' | 'WORK_SCHEDULE';
export type DocumentKind = 'RECEIPT' | 'TRANSACTION_STATEMENT' | 'DELIVERY_NOTE' | 'UNKNOWN';
export type InputStyle = 'HANDWRITTEN' | 'PRINTED' | 'DIGITAL' | 'MIXED' | 'UNKNOWN';
export type WarningCode =
  | 'PRICE_MISSING'
  | 'OCR_UNCLEAR'
  | 'AMOUNT_MISMATCH'
  | 'PRICE_ANOMALY'
  | 'UNIT_UNKNOWN'
  | 'UNMATCHED'
  | 'TOTAL_MISMATCH'
  | 'DUPLICATE_SUSPECTED';
export interface Product {
  id: string;
  name: string;
  unit: string;
  category: string;
  aliases: string[];
}
export interface ReceiptItem {
  id: string;
  raw_name: string;
  normalized_name: string;
  product_id: string | null;
  quantity: number | null;
  unit: string;
  unit_price: number | null;
  line_total: number | null;
  currency: 'KRW';
  status: ReceiptStatus;
  warnings: WarningCode[];
  comparison: {
    previous_price: number;
    previous_date: string;
    comparison_unit: string;
    change_pct: number;
  } | null;
  evidence_bbox: number[] | null;
  anomaly_confirmed?: boolean;
}
export interface Receipt {
  receipt_id: string;
  room_id: string;
  status: ReceiptStatus;
  version: number;
  /** Legacy metadata only. New uploads do not specify a format. */
  upload_mode?: UploadMode;
  document_kind: DocumentKind;
  input_style: InputStyle;
  has_price: boolean;
  supplier: { id: string; name: string };
  purchased_at: string | null;
  created_at: string;
  image_url: string | null;
  file_name: string;
  file_type: string;
  items: ReceiptItem[];
  demo_scenario?: string;
  content_hash?: string;
  error?: string;
  source_message_id?: string;
  amounts?: {
    supply_amount: number | null;
    tax_amount: number | null;
    total_amount: number | null;
  };
  activity?: { id: string; created_at: string; actor: string; description: string }[];
  issues?: {
    code: string;
    path: string;
    severity: 'BLOCKING' | 'WARNING' | 'INFO';
    message: string;
  }[];
  capabilities?: { can_edit: boolean; can_approve: boolean };
}
export interface Message {
  id: string;
  reply_to?: import('./chat').MessageReply;
  deleted_at?: string;
  text?: string;
  receipt_id?: string;
  schedule_id?: string;
  room_id?: string;
  attachment?: { name: string; type: string; size: number; url: string };
  author: string;
  created_at: string;
  own: boolean;
}
export interface ChatRoom {
  id: string;
  name: string;
  created_at: string;
}
export interface Purchase {
  id: string;
  receipt_id: string;
  product_id: string;
  name: string;
  unit: string;
  unit_price: number;
  quantity: number;
  supplier: string;
  purchased_at: string;
}
export interface Summary {
  processing: number;
  review: number;
  approved: number;
  total: number;
  recent: Receipt[];
}
export type ItemPatch = Pick<
  ReceiptItem,
  'product_id' | 'quantity' | 'unit' | 'unit_price' | 'line_total' | 'anomaly_confirmed'
>;
export interface Api {
  rooms(): Promise<ChatRoom[]>;
  createRoom(name: string): Promise<ChatRoom>;
  messages(room: string): Promise<Message[]>;
  send(room: string, text: string, replyTo?: string): Promise<Message>;
  deleteMessage(room: string, messageId: string): Promise<void>;
  attach(room: string, file: File, replyTo?: string): Promise<Message>;
  upload(file: File, room: string): Promise<Receipt>;
  receipt(id: string): Promise<Receipt>;
  patchItem(id: string, item: string, patch: ItemPatch, version: number): Promise<void>;
  patchDocument(
    id: string,
    patch: Pick<Receipt, 'document_kind' | 'input_style' | 'purchased_at' | 'supplier'>,
    version: number,
  ): Promise<void>;
  approve(id: string, version: number, key: string): Promise<void>;
  retry(id: string): Promise<void>;
  prices(): Promise<Purchase[]>;
  summary(): Promise<Summary>;
  products(): Promise<Product[]>;
  saveProduct(product: Product): Promise<void>;
  sample(scenario: string, room: string): Promise<Receipt>;
}

import { z } from 'zod';
import type { Receipt, ReceiptStatus, WarningCode } from './types';

const status = z.enum([
  'UPLOADED',
  'PROCESSING',
  'NEEDS_REVIEW',
  'READY_TO_APPROVE',
  'APPROVED',
  'FAILED',
]);
const amount = z
  .union([
    z.number().finite(),
    z
      .string()
      .regex(/^-?\d+(?:\.\d+)?$/)
      .transform(Number)
      .pipe(z.number().finite()),
  ])
  .nullish()
  .transform((value) => value ?? null);
const text = z
  .string()
  .nullish()
  .transform((value) => value ?? '');
const issue = z.object({
  code: z.string(),
  path: z.string().default(''),
  severity: z.enum(['BLOCKING', 'WARNING', 'INFO']).default('WARNING'),
  message: z.string(),
});
const knownWarnings = [
  'PRICE_MISSING',
  'OCR_UNCLEAR',
  'AMOUNT_MISMATCH',
  'PRICE_ANOMALY',
  'UNIT_UNKNOWN',
  'UNMATCHED',
  'TOTAL_MISMATCH',
  'DUPLICATE_SUSPECTED',
];
const schema = z.object({
  schema_version: z.literal('1').optional(),
  receipt_id: z.string().min(1),
  version: z.number().int().nonnegative(),
  status,
  room_id: text,
  source_message_id: text,
  created_at: text,
  upload_mode: z.enum(['AUTO', 'HANDWRITTEN', 'PRINTED', 'DIGITAL']).optional(),
  source: z.object({ room_id: text, message_id: text }).optional(),
  classification: z.object({ document_kind: text, input_style: text }).optional(),
  document_kind: text,
  input_style: text,
  file: z.object({ name: text, mime_type: text, url: z.string().nullable().optional() }).optional(),
  file_name: text,
  file_type: text,
  image_url: z.string().nullish(),
  supplier: z.object({ id: text, name: text }).nullish(),
  purchased_at: z.string().nullable().optional(),
  currency: z.literal('KRW').optional(),
  amounts: z.object({ supply_amount: amount, tax_amount: amount, total_amount: amount }).optional(),
  items: z
    .array(
      z.object({
        id: z.string().min(1),
        raw_name: text,
        normalized_name: text,
        product_id: z.string().nullable().optional(),
        quantity: amount,
        unit: text,
        unit_price: amount,
        line_total: amount,
        status: status.optional(),
        warnings: z.array(z.string()).default([]),
        comparison: z
          .object({
            previous_price: z.number().positive(),
            previous_date: z.string(),
            comparison_unit: z.string(),
            change_pct: z.number().finite(),
          })
          .nullish(),
        evidence_bbox: z.array(z.number().finite()).nullable().optional(),
        anomaly_confirmed: z.boolean().optional(),
      }),
    )
    .optional(),
  issues: z.array(issue).optional(),
  capabilities: z.object({ can_edit: z.boolean(), can_approve: z.boolean() }).optional(),
  activity: z
    .array(
      z.object({
        id: z.string(),
        created_at: z.string(),
        actor: z.string(),
        description: z.string(),
      }),
    )
    .optional(),
  error: z.string().optional(),
  demo_scenario: z.string().optional(),
});
/** Flat legacy response and the proposed schema_version=1 response share one UI model. */
export function receiptFromWire(value: unknown): Receipt {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new Error('영수증 응답 형식이 계약과 다릅니다. 서버 담당자에게 문의해 주세요.');
  const r = parsed.data;
  if (!r.items && !['UPLOADED', 'PROCESSING', 'FAILED'].includes(r.status))
    throw new Error('완료된 영수증 응답에 품목 목록이 없습니다.');
  if (r.items && new Set(r.items.map((item) => item.id)).size !== r.items.length)
    throw new Error('영수증 응답에 중복된 품목 ID가 있습니다.');
  const kind = r.classification?.document_kind || r.document_kind;
  const style = r.classification?.input_style || r.input_style;
  return {
    receipt_id: r.receipt_id,
    version: r.version,
    status: r.status,
    room_id: r.source?.room_id || r.room_id,
    source_message_id: r.source?.message_id || r.source_message_id || undefined,
    created_at: r.created_at,
    upload_mode: r.upload_mode,
    document_kind: ['RECEIPT', 'TRANSACTION_STATEMENT', 'DELIVERY_NOTE'].includes(kind)
      ? (kind as Receipt['document_kind'])
      : 'UNKNOWN',
    input_style: ['HANDWRITTEN', 'PRINTED', 'DIGITAL', 'MIXED'].includes(style)
      ? (style as Receipt['input_style'])
      : 'UNKNOWN',
    supplier: r.supplier ?? { id: '', name: '' },
    purchased_at: r.purchased_at ?? null,
    file_name: r.file?.name || r.file_name || `영수증 ${r.receipt_id}`,
    file_type:
      r.file?.mime_type ||
      r.file_type ||
      (/\.pdf(?:\?|$)/i.test(r.image_url ?? '') ? 'application/pdf' : 'image/jpeg'),
    image_url: r.file?.url ?? r.image_url ?? null,
    amounts: r.amounts,
    activity: r.activity,
    issues: r.issues,
    capabilities: r.capabilities,
    error: r.error,
    demo_scenario: r.demo_scenario,
    has_price: (r.items ?? []).some((item) => item.unit_price != null),
    items: (r.items ?? []).map((item, index) => {
      const issueCodes =
        r.issues
          ?.filter(
            (issue) =>
              issue.path.startsWith(`items.${item.id}.`) ||
              issue.path.startsWith(`items.${index}.`),
          )
          .map((issue) => issue.code) ?? [];
      const warnings = [
        ...new Set(
          [...item.warnings, ...issueCodes].map((code) =>
            knownWarnings.includes(code) ? code : 'OCR_UNCLEAR',
          ),
        ),
      ] as WarningCode[];
      const itemStatus: ReceiptStatus =
        item.status ??
        (r.status === 'APPROVED'
          ? 'APPROVED'
          : warnings.length
            ? 'NEEDS_REVIEW'
            : r.status === 'READY_TO_APPROVE'
              ? 'READY_TO_APPROVE'
              : 'NEEDS_REVIEW');
      return {
        ...item,
        normalized_name: item.normalized_name || (item.product_id ? item.raw_name : ''),
        product_id: item.product_id ?? null,
        status: itemStatus,
        warnings,
        currency: 'KRW',
        comparison: item.comparison ?? null,
        evidence_bbox: item.evidence_bbox ?? null,
      };
    }),
  };
}

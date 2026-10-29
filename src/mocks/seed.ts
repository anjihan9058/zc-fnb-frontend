import type { Product, Receipt, ReceiptItem, Purchase, Message } from '../shared/types';
import { today } from '../shared/format';
import { validateReceipt } from './domain';
export const products: Product[] = [
  { id: 'onion', name: '양파', unit: 'kg', category: '채소', aliases: ['양파 1kg', '국산 양파'] },
  { id: 'green-onion', name: '대파', unit: '단', category: '채소', aliases: ['대파 1단'] },
  { id: 'pork', name: '돼지고기 앞다리', unit: 'kg', category: '정육', aliases: ['돈전지'] },
  { id: 'rice', name: '백미', unit: 'kg', category: '곡물', aliases: ['쌀'] },
  { id: 'oil', name: '콩기름', unit: 'L', category: '가공식품', aliases: ['식용유'] },
  { id: 'garlic', name: '깐마늘', unit: 'kg', category: '채소', aliases: ['통마늘'] },
];
export const dayAgo = (n: number) => {
  const d = new Date(today() + 'T12:00:00+09:00');
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
export function demoReceipt(scenario: string, id: string, room = 'room_demo_01'): Receipt {
  const item: ReceiptItem = {
    id: 'item-1',
    raw_name: '양파 1kg',
    normalized_name: '양파',
    product_id: 'onion',
    quantity: 3,
    unit: 'kg',
    unit_price: 2800,
    line_total: 8400,
    currency: 'KRW',
    status: 'READY_TO_APPROVE',
    warnings: [],
    comparison: {
      previous_price: 2500,
      previous_date: dayAgo(2),
      comparison_unit: 'kg',
      change_pct: 12,
    },
    evidence_bbox: null,
  };
  if (scenario === 'anomaly') {
    item.unit_price = 25000;
    item.line_total = 75000;
  }
  if (scenario === 'missing') {
    item.unit_price = null;
    item.line_total = null;
  }
  if (scenario === 'mismatch') item.line_total = 9000;
  if (scenario === 'unknown') {
    item.product_id = null;
    item.unit = '망';
  }
  const second: ReceiptItem = {
    ...item,
    id: 'item-2',
    raw_name: '대파 1단',
    normalized_name: '대파',
    product_id: 'green-onion',
    quantity: 2,
    unit: '단',
    unit_price: scenario === 'missing' ? null : 3000,
    line_total: scenario === 'missing' ? null : 6000,
    comparison: null,
  };
  return validateReceipt(
    {
      receipt_id: id,
      room_id: room,
      status: 'NEEDS_REVIEW',
      version: 1,
      upload_mode: 'AUTO',
      document_kind: scenario === 'missing' ? 'DELIVERY_NOTE' : 'TRANSACTION_STATEMENT',
      input_style: 'PRINTED',
      has_price: true,
      supplier: { id: 'demo-market', name: '부산청과 (가상 업체)' },
      purchased_at: today(),
      created_at: new Date().toISOString(),
      image_url: `/samples/${scenario === 'anomaly' ? 'anomaly' : scenario === 'missing' ? 'missing' : 'normal'}.svg`,
      file_name: `시연용_${scenario}.svg`,
      file_type: 'image/svg+xml',
      demo_scenario: scenario,
      items: [item, second],
    },
    products,
  );
}
export interface Database {
  rooms?: import('../shared/types').ChatRoom[];
  receipts: Receipt[];
  messages: Message[];
  purchases: Purchase[];
  products: Product[];
}
export function seed(): Database {
  const prices = [2500, 3000, 9800, 3200, 3400, 7600];
  const purchases: Purchase[] = [];
  for (let d = 28; d >= 2; d -= 2)
    products.forEach((p, i) => {
      const price = Math.round((prices[i] * (1 + Math.sin(d * 0.42 + i) * 0.08)) / 100) * 100;
      purchases.push({
        id: `history-${d}-${i}`,
        receipt_id: `historical-${d}`,
        product_id: p.id,
        name: p.name,
        unit: p.unit,
        quantity: 3 + i,
        unit_price: d === 2 ? prices[i] : price,
        supplier: i % 2 ? '동래식자재 (가상 업체)' : '부산청과 (가상 업체)',
        purchased_at: dayAgo(d),
      });
    });
  const receipts = [
    demoReceipt('anomaly', 'demo-anomaly'),
    demoReceipt('missing', 'demo-missing'),
    demoReceipt('normal', 'demo-ready'),
  ];
  return {
    receipts,
    purchases,
    products,
    messages: [
      {
        id: 'welcome',
        text: '오늘 입고된 식재료 명세서입니다. 가격이 달라진 항목을 함께 확인해 주세요.',
        author: '김민지 매니저',
        created_at: new Date().toISOString(),
        own: false,
      },
      ...receipts.map((r, i) => ({
        id: `seed-${i}`,
        receipt_id: r.receipt_id,
        author: 'ZC FNB AI',
        created_at: r.created_at,
        own: false,
      })),
    ],
  };
}

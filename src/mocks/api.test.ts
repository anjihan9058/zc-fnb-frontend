import 'fake-indexeddb/auto';
import { del } from 'idb-keyval';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockApi } from './api';
import { today } from '../shared/format';

beforeEach(async () => {
  vi.stubGlobal('navigator', { onLine: true });
  await del('sikjangbu-demo-v1');
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Mock API 저장·검증·승인 통합', () => {
  it('비동기 분석 → 수정 → 재검증 → 동시 승인에도 구매 이력은 한 번만 반영된다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const before = await mockApi.prices();
    const r = await mockApi.sample('anomaly', 'room_demo_01');
    expect(r.status).toBe('UPLOADED');
    vi.setSystemTime(Date.now() + 1500);
    expect((await mockApi.receipt(r.receipt_id)).status).toBe('PROCESSING');
    vi.setSystemTime(Date.now() + 5000);
    const review = await mockApi.receipt(r.receipt_id);
    expect(review.status).toBe('NEEDS_REVIEW');
    expect(await mockApi.prices()).toHaveLength(before.length);
    await mockApi.patchItem(
      r.receipt_id,
      review.items[0].id,
      {
        product_id: 'onion',
        quantity: 3,
        unit: 'kg',
        unit_price: 2500,
        line_total: 7500,
        anomaly_confirmed: false,
      },
      review.version,
    );
    const ready = await mockApi.receipt(r.receipt_id);
    expect(ready.status).toBe('READY_TO_APPROVE');
    expect(await mockApi.prices()).toHaveLength(before.length);
    await Promise.all([
      mockApi.approve(r.receipt_id, ready.version, 'same-key'),
      mockApi.approve(r.receipt_id, ready.version, 'same-key'),
    ]);
    expect((await mockApi.receipt(r.receipt_id)).status).toBe('APPROVED');
    expect(await mockApi.prices()).toHaveLength(before.length + 2);
    await expect(
      mockApi.patchItem(
        r.receipt_id,
        ready.items[0].id,
        { product_id: 'onion', quantity: 3, unit: 'kg', unit_price: 99, line_total: 297 },
        ready.version + 1,
      ),
    ).rejects.toThrow('수정할 수 없습니다');
  });
  it('오래된 버전 수정과 가격 누락 승인은 저장소를 오염시키지 않는다', async () => {
    const r = await mockApi.receipt('demo-missing');
    const before = await mockApi.prices();
    await expect(mockApi.approve(r.receipt_id, r.version, 'key')).rejects.toThrow('확인 필요한');
    await expect(
      mockApi.patchItem(
        r.receipt_id,
        r.items[0].id,
        { product_id: 'onion', quantity: 3, unit: 'kg', unit_price: 2500, line_total: 7500 },
        0,
      ),
    ).rejects.toThrow('409');
    expect(await mockApi.prices()).toHaveLength(before.length);
    expect((await mockApi.receipt(r.receipt_id)).items[0].unit_price).toBeNull();
  });
  it('실제 파일은 자동 추출값을 만들지 않고 중복 파일을 차단한다', async () => {
    class TestReader {
      result = '';
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL(blob: Blob) {
        blob.arrayBuffer().then((buffer) => {
          this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`;
          this.onload?.();
        });
      }
    }
    vi.stubGlobal('FileReader', TestReader);
    vi.useFakeTimers({ toFake: ['Date'] });
    const file = new File(['synthetic-file'], 'test.png', { type: 'image/png' });
    const r = await mockApi.upload(file, 'room_demo_01');
    expect(r.upload_mode).toBeUndefined();
    expect(r.purchased_at).toBeNull();
    expect(r.items[0].unit_price).toBeNull();
    expect(r.items[0].product_id).toBeNull();
    await expect(mockApi.upload(file, 'room_demo_01')).rejects.toThrow('이미 올린 파일');
    vi.setSystemTime(Date.now() + 5000);
    const review = await mockApi.receipt(r.receipt_id);
    await mockApi.patchDocument(
      r.receipt_id,
      {
        supplier: { id: 'manual', name: '테스트 업체' },
        purchased_at: today(),
        document_kind: 'RECEIPT',
        input_style: 'HANDWRITTEN',
      },
      review.version,
    );
    const updated = await mockApi.receipt(r.receipt_id);
    expect(updated.supplier.name).toBe('테스트 업체');
    expect(updated.status).toBe('NEEDS_REVIEW');
  });
  it('오프라인에서는 메시지와 승인 요청을 실행하지 않는다', async () => {
    vi.stubGlobal('navigator', { onLine: false });
    await expect(mockApi.send('room_demo_01', 'test')).rejects.toThrow('오프라인');
    await expect(mockApi.approve('demo-ready', 1, 'key')).rejects.toThrow('오프라인');
  });
  it('실패한 분석만 재시도하고 복구 중에는 가격에 반영하지 않는다', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const before = await mockApi.prices();
    const receipt = await mockApi.sample('failed', 'room_demo_01');
    vi.setSystemTime(Date.now() + 5000);
    expect((await mockApi.receipt(receipt.receipt_id)).status).toBe('FAILED');
    await mockApi.retry(receipt.receipt_id);
    expect((await mockApi.receipt(receipt.receipt_id)).status).toBe('UPLOADED');
    vi.setSystemTime(Date.now() + 5000);
    expect((await mockApi.receipt(receipt.receipt_id)).status).toBe('READY_TO_APPROVE');
    expect(await mockApi.prices()).toHaveLength(before.length);
    await expect(mockApi.retry(receipt.receipt_id)).rejects.toThrow('실패한 분석만');
  });
  it('구매 이력이 없는 식재료도 저장·수정되고 동일 품목·단위 중복은 거절한다', async () => {
    const product = { id: 'qa-product', name: 'QA 식재료', unit: 'kg', category: '채소', aliases: ['가상 별칭'] };
    const before = await mockApi.products();
    await mockApi.saveProduct(product);
    expect(await mockApi.products()).toHaveLength(before.length + 1);
    expect((await mockApi.prices()).some((row) => row.product_id === product.id)).toBe(false);
    await mockApi.saveProduct({ ...product, aliases: ['수정된 별칭'] });
    expect((await mockApi.products()).find((row) => row.id === product.id)?.aliases).toEqual(['수정된 별칭']);
    await expect(mockApi.saveProduct({ ...product, id: 'duplicate' })).rejects.toThrow('이미 등록된');
    expect(await mockApi.products()).toHaveLength(before.length + 1);
  });
});

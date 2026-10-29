import { createId } from '../shared/id';
import { get, set } from 'idb-keyval';
import type { Api, Receipt, ChatRoom } from '../shared/types';
import { seed, demoReceipt, type Database } from './seed';
import { approveReceipt, previousPurchase, validateReceipt } from './domain';
import { mockScheduleApi } from './schedules';
import { fileHash } from '../shared/id';
import { defaultWorkspace, getWorkspaceId, workspaceStorageKey } from '../shared/workspaces';
import { messageText } from '../shared/chat';
const delay = () => new Promise((resolve) => setTimeout(resolve, 180));
let queue: Promise<unknown> = Promise.resolve();
function db<T>(action: (data: Database) => T | Promise<T>): Promise<T> {
  const KEY = workspaceStorageKey('sikjangbu-demo-v1');
  const isDefault = getWorkspaceId() === defaultWorkspace.id;
  const run = async () => {
    await delay();
    if (!navigator.onLine) throw new Error('오프라인입니다. 연결 후 다시 시도해 주세요.');
    const data: Database =
      (await get<Database>(KEY)) ??
      (isDefault
        ? seed()
        : {
            receipts: [],
            messages: [],
            purchases: [],
            products: structuredClone(seed().products),
          });
    data.rooms ??= [
      {
        id: isDefault ? defaultWorkspace.room_id : `room_${getWorkspaceId()}`,
        name: '우리 팀 이야기',
        created_at: new Date().toISOString(),
      },
    ];
    data.messages.forEach((message) => {
      message.room_id ??=
        data.receipts.find((receipt) => receipt.receipt_id === message.receipt_id)?.room_id ??
        data.rooms![0].id;
    });
    data.receipts.forEach((receipt) => {
      receipt.source_message_id ??= data.messages.find(
        (message) => message.receipt_id === receipt.receipt_id,
      )?.id;
    });
    const result = await action(data);
    await set(KEY, data);
    return structuredClone(result);
  };
  const locked = async (): Promise<T> =>
    navigator.locks ? await navigator.locks.request(KEY, run) : await run();
  const result = queue.then(locked, locked);
  queue = result.catch(() => {});
  return result;
}
function find(data: Database, id: string) {
  const r = data.receipts.find((r) => r.receipt_id === id);
  if (!r) throw new Error('영수증을 찾을 수 없습니다. 채팅방에서 다시 선택해 주세요.');
  advance(r, data);
  return r;
}
function advance(r: Receipt, data: Database) {
  if (!['UPLOADED', 'PROCESSING'].includes(r.status)) return;
  const elapsed = Date.now() - new Date(r.created_at).getTime();
  if (elapsed > 3200) {
    if (r.demo_scenario === 'failed') {
      r.status = 'FAILED';
      r.error = '분석 서비스에 연결하지 못했습니다. (시연용 실패)';
    } else Object.assign(r, validateReceipt(r, data.products));
  } else if (elapsed > 700) r.status = 'PROCESSING';
}
function editable(r: Receipt, version: number) {
  if (r.version !== version)
    throw new Error('409: 다른 창에서 수정되었습니다. 새로고침 후 다시 시도해 주세요.');
  if (!['NEEDS_REVIEW', 'READY_TO_APPROVE'].includes(r.status))
    throw new Error('현재 상태에서는 수정할 수 없습니다.');
}
function add(data: Database, receipt: Receipt) {
  receipt.source_message_id = createId();
  data.receipts.unshift(receipt);
  data.messages.push({
    id: receipt.source_message_id,
    receipt_id: receipt.receipt_id,
    room_id: receipt.room_id,
    author: '나',
    own: true,
    created_at: receipt.created_at,
  });
  return receipt;
}
export const mockApi: Api = {
  rooms: () => db((data) => data.rooms!),
  createRoom: (name) =>
    db((data) => {
      if (!name.trim() || name.trim().length > 60)
        throw new Error('채팅방 이름은 1~60자로 입력해 주세요.');
      const room: ChatRoom = {
        id: createId(),
        name: name.trim(),
        created_at: new Date().toISOString(),
      };
      data.rooms!.push(room);
      return room;
    }),
  messages: async (room) => {
    const messages = await db((data) => data.messages.filter((m) => m.room_id === room));
    const schedules = await mockScheduleApi.list();
    return [
      ...messages,
      ...schedules
        .filter((d) => d.room_id === room)
        .map((d) => ({
          id: `schedule-message-${d.schedule_id}`,
          schedule_id: d.schedule_id,
          author: '나',
          own: true,
          created_at: d.created_at,
        })),
    ].sort((a, b) => a.created_at.localeCompare(b.created_at));
  },
  send: async (room, text, replyTo) => {
    const schedule = replyTo?.startsWith('schedule-message-')
      ? await mockScheduleApi.get(replyTo.slice('schedule-message-'.length))
      : null;
    return db((data) => {
      if (!data.rooms!.some((r) => r.id === room))
        throw new Error('현재 사업장의 채팅방이 아닙니다.');
      const original = replyTo
        ? (data.messages.find((m) => m.id === replyTo && m.room_id === room && !m.deleted_at) ??
          (schedule?.room_id === room
            ? {
                id: replyTo,
                author: '나',
                text: schedule.file_name,
                own: true,
                created_at: schedule.created_at,
              }
            : undefined))
        : undefined;
      if (replyTo && !original) throw new Error('답장할 메시지를 찾을 수 없습니다.');
      const m = {
        id: createId(),
        text: text.trim(),
        room_id: room,
        author: '나',
        own: true,
        created_at: new Date().toISOString(),
        ...(original
          ? {
              reply_to: {
                id: original.id,
                author: original.author,
                text: messageText(original).slice(0, 500),
              },
            }
          : {}),
      };
      if (!m.text || m.text.length > 50000) throw new Error('메시지는 1~50,000자로 입력해 주세요.');
      data.messages.push(m);
      return m;
    });
  },
  deleteMessage: (room, id) =>
    db((data) => {
      const message = data.messages.find((m) => m.id === id && m.room_id === room);
      if (!message || !message.own) throw new Error('내가 보낸 메시지만 삭제할 수 있습니다.');
      message.deleted_at = new Date().toISOString();
      delete message.text;
      delete message.attachment;
      delete message.reply_to;
      delete message.receipt_id;
      delete message.schedule_id;
      data.messages.forEach((m) => {
        if (m.reply_to?.id === id) m.reply_to.text = '삭제된 메시지입니다.';
      });
    }),
  attach: async (room, file, replyTo) => {
    const schedule = replyTo?.startsWith('schedule-message-')
      ? await mockScheduleApi.get(replyTo.slice('schedule-message-'.length))
      : null;
    const url = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('첨부 파일을 읽지 못했습니다.'));
      reader.readAsDataURL(file);
    });
    return db((data) => {
      if (!data.rooms!.some((r) => r.id === room))
        throw new Error('현재 사업장의 채팅방이 아닙니다.');
      const original = replyTo
        ? (data.messages.find((m) => m.id === replyTo && m.room_id === room && !m.deleted_at) ??
          (schedule?.room_id === room
            ? {
                id: replyTo,
                author: '나',
                text: schedule.file_name,
                own: true,
                created_at: schedule.created_at,
              }
            : undefined))
        : undefined;
      if (replyTo && !original) throw new Error('답장할 메시지를 찾을 수 없습니다.');
      const message = {
        id: createId(),
        room_id: room,
        author: '나',
        own: true,
        created_at: new Date().toISOString(),
        attachment: { name: file.name, type: file.type, size: file.size, url },
        ...(original
          ? {
              reply_to: {
                id: original.id,
                author: original.author,
                text: messageText(original).slice(0, 500),
              },
            }
          : {}),
      };
      data.messages.push(message);
      return message;
    });
  },
  upload: async (file, room) => {
    const hash = await fileHash(file);
    const image = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
      reader.readAsDataURL(file);
    });
    return db((data) => {
      if (data.receipts.some((r) => (hash && r.content_hash === hash) || r.image_url === image))
        throw new Error('이미 올린 파일입니다. 채팅방에서 기존 영수증을 확인해 주세요.');
      const r = demoReceipt('manual', createId(), room);
      r.status = 'UPLOADED';
      delete r.upload_mode;
      r.input_style = 'UNKNOWN';
      r.document_kind = 'UNKNOWN';
      r.image_url = image;
      r.file_name = file.name;
      r.file_type = file.type;
      r.content_hash = hash;
      r.purchased_at = null;
      r.supplier = { id: 'manual', name: '' };
      r.items = [
        {
          ...r.items[0],
          raw_name: '직접 입력할 품목',
          product_id: null,
          normalized_name: '',
          quantity: null,
          unit: '',
          unit_price: null,
          line_total: null,
          comparison: null,
        },
      ];
      return add(data, r);
    });
  },
  receipt: (id) => db((data) => find(data, id)),
  patchItem: (id, itemId, patch, version) =>
    db((data) => {
      const r = find(data, id);
      editable(r, version);
      const item = r.items.find((i) => i.id === itemId);
      if (!item) throw new Error('항목이 없습니다.');
      const changed =
        item.product_id !== patch.product_id ||
        item.unit !== patch.unit ||
        item.unit_price !== patch.unit_price;
      Object.assign(item, patch);
      if (changed) item.anomaly_confirmed = !!patch.anomaly_confirmed;
      const previous = previousPurchase(
        data.purchases,
        patch.product_id ?? '',
        patch.unit,
        r.purchased_at ?? '',
      );
      item.comparison = previous
        ? {
            previous_price: previous.unit_price,
            previous_date: previous.purchased_at,
            comparison_unit: previous.unit,
            change_pct: 0,
          }
        : null;
      Object.assign(r, validateReceipt(r, data.products), { version: r.version + 1 });
    }),
  patchDocument: (id, patch, version) =>
    db((data) => {
      const r = find(data, id);
      editable(r, version);
      Object.assign(r, patch);
      r.items.forEach((i) => {
        const prev = previousPurchase(
          data.purchases,
          i.product_id ?? '',
          i.unit,
          r.purchased_at ?? '',
        );
        i.comparison = prev
          ? {
              previous_price: prev.unit_price,
              previous_date: prev.purchased_at,
              comparison_unit: prev.unit,
              change_pct: 0,
            }
          : null;
        i.anomaly_confirmed = false;
      });
      Object.assign(r, validateReceipt(r, data.products), { version: r.version + 1 });
    }),
  approve: (id, version) =>
    db((data) => {
      const r = find(data, id);
      if (
        r.content_hash &&
        data.receipts.some(
          (other) =>
            other.receipt_id !== id &&
            other.content_hash === r.content_hash &&
            other.status === 'APPROVED',
        )
      )
        throw new Error('이미 승인된 중복 문서입니다.');
      const result = approveReceipt(r, data.products, data.purchases, version);
      Object.assign(r, result.receipt);
      data.purchases = result.purchases;
    }),
  retry: (id) =>
    db((data) => {
      const r = find(data, id);
      if (r.status !== 'FAILED') throw new Error('실패한 분석만 재시도할 수 있습니다.');
      r.demo_scenario = 'normal';
      r.status = 'UPLOADED';
      r.created_at = new Date().toISOString();
      r.version++;
    }),
  prices: () => db((data) => data.purchases),
  summary: () =>
    db((data) => {
      data.receipts.forEach((r) => advance(r, data));
      return {
        processing: data.receipts.filter((r) => ['UPLOADED', 'PROCESSING'].includes(r.status))
          .length,
        review: data.receipts.filter((r) => r.status === 'NEEDS_REVIEW').length,
        approved: data.receipts.filter((r) => r.status === 'APPROVED').length,
        total: data.receipts.length,
        recent: data.receipts,
      };
    }),
  products: () => db((data) => data.products),
  saveProduct: (product) =>
    db((data) => {
      if (!product.name.trim() || !product.unit.trim())
        throw new Error('품목명과 단위를 입력해 주세요.');
      if (
        data.products.some(
          (p) => p.id !== product.id && p.name === product.name && p.unit === product.unit,
        )
      )
        throw new Error('이미 등록된 품목과 단위입니다.');
      const i = data.products.findIndex((p) => p.id === product.id);
      if (i < 0) data.products.push(product);
      else data.products[i] = product;
    }),
  sample: (scenario, room) =>
    db((data) => {
      const r = demoReceipt(scenario, createId(), room);
      r.status = 'UPLOADED';
      return add(data, r);
    }),
};

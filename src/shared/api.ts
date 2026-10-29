import type { Api, Receipt, Product, Message, Purchase, Summary, ChatRoom } from './types';
import { mockApi } from '../mocks/api';
import { receiptFromWire } from './receiptWire';
import type { ScheduleApi, WorkSchedule, Employee, ConfirmedShift } from './schedules';
import { mockScheduleApi } from '../mocks/schedules';
import { getWorkspaceId, localWorkspaces, type Workspace } from './workspaces';
import type { MenuCost, MenuRecipe, OperationsApi, ReceivingDocument } from './operations';
import { mockOperationsApi } from '../mocks/operations';
import type { WasteApi, WasteRecord } from './waste';
import { mockWasteApi } from '../mocks/waste';
import { demoUser, type SessionUser } from './auth';
import { ApiError, apiFailure } from './errors';
import type { ChatManagementApi, ChatPerson, RoomMembership } from './chat';
import { mockChatManagement } from '../mocks/chat';
export const isDemo = import.meta.env.VITE_API_MODE !== 'http';
const base = (import.meta.env.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');
async function request<T>(path: string, init?: RequestInit, scoped = true): Promise<T> {
  if (!navigator.onLine) throw new Error('오프라인입니다. 연결 후 다시 시도해 주세요.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  const write = !!init?.method && !['GET', 'HEAD'].includes(init.method.toUpperCase());
  try {
    const response = await fetch(`${base}${path}`, {
      ...init,
      credentials: 'include',
      signal: controller.signal,
      headers: {
        ...(scoped ? { 'X-Workspace-Id': getWorkspaceId() } : {}),
        ...(init?.body && !(init.body instanceof FormData)
          ? { 'Content-Type': 'application/json' }
          : {}),
        ...init?.headers,
      },
    });
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      if (response.status === 401 && !path.startsWith('/auth/') && typeof window !== 'undefined')
        window.dispatchEvent(new Event('zcfnb:session-expired'));
      throw apiFailure(
        response.status,
        error,
        response.headers.get('X-Request-Id'),
        path === '/auth/login',
        write,
      );
    }
    if (response.status === 204) return undefined as T;
    return await response.json();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError')
      throw new ApiError('응답 시간이 초과되었습니다.', 0, 'TIMEOUT', '', {}, write);
    if (error instanceof TypeError)
      throw new ApiError(
        '서버에 연결할 수 없습니다. 네트워크를 확인해 주세요.',
        0,
        'NETWORK_ERROR',
        '',
        {},
        write,
      );
    if (error instanceof SyntaxError)
      throw new ApiError(
        '서버 응답을 읽지 못했습니다. 처리 상태를 확인해 주세요.',
        0,
        'INVALID_RESPONSE',
        '',
        {},
        write,
      );
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
const json = (method: string, value?: unknown) => ({
  method,
  body: value === undefined ? undefined : JSON.stringify(value),
});
export const authApi = {
  session: async (): Promise<SessionUser | null> => {
    if (isDemo) return demoUser;
    try {
      return await request<SessionUser>('/auth/me', undefined, false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },
  login: async (email: string, password: string): Promise<SessionUser> => {
    if (isDemo)
      throw new Error('데모에서는 비밀번호 로그인을 사용하지 않습니다. 데모 시작을 눌러 주세요.');
    return request<SessionUser>('/auth/login', json('POST', { email, password }), false);
  },
  logout: async (): Promise<void> => {
    if (!isDemo) await request<void>('/auth/logout', json('POST'), false);
  },
};
export const workspaceApi = isDemo
  ? localWorkspaces
  : {
      list: () => request<Workspace[]>('/workspaces', undefined, false),
      create: (name: string, address: string) =>
        request<Workspace>('/workspaces', json('POST', { name, address }), false),
    };
const path = (id: string) => `/receipts/${encodeURIComponent(id)}`;
export const httpApi: Api = {
  rooms: () => request<ChatRoom[]>('/chat/rooms'),
  createRoom: (name) => request<ChatRoom>('/chat/rooms', json('POST', { name })),
  messages: (room) => request<Message[]>(`/rooms/${encodeURIComponent(room)}/messages`),
  send: (room, text, replyTo) =>
    request<Message>(
      `/rooms/${encodeURIComponent(room)}/messages`,
      json('POST', { text, ...(replyTo ? { reply_to: replyTo } : {}) }),
    ),
  deleteMessage: (room, id) =>
    request<void>(
      `/rooms/${encodeURIComponent(room)}/messages/${encodeURIComponent(id)}`,
      json('DELETE'),
    ),
  attach: (room, file, replyTo) => {
    validateFile(file);
    const body = new FormData();
    body.append('file', file);
    if (replyTo) body.append('reply_to', replyTo);
    return request<Message>(`/rooms/${encodeURIComponent(room)}/messages/attachments`, {
      method: 'POST',
      body,
    });
  },
  upload: async (file, room) => {
    validateFile(file);
    const body = new FormData();
    body.append('file', file);
    body.append('room_id', room);
    const r = await request<{ receipt_id: string }>('/receipts', { method: 'POST', body });
    return { ...r, status: 'UPLOADED' } as Receipt;
  },
  receipt: async (id) => receiptFromWire(await request<Receipt>(path(id))),
  patchItem: (id, item, patch, version) =>
    request<void>(
      `${path(id)}/items/${encodeURIComponent(item)}`,
      json('PATCH', {
        product_id: patch.product_id,
        quantity: patch.quantity,
        unit: patch.unit,
        unit_price: patch.unit_price,
        line_total: patch.line_total,
        anomaly_confirmed: patch.anomaly_confirmed,
        version,
      }),
    ),
  patchDocument: (id, patch, version) =>
    request<void>(
      path(id),
      json('PATCH', {
        document_kind: patch.document_kind,
        input_style: patch.input_style,
        purchased_at: patch.purchased_at,
        supplier: { id: patch.supplier.id, name: patch.supplier.name },
        version,
      }),
    ),
  approve: (id, version, idempotency_key) =>
    request<void>(`${path(id)}/approve`, json('POST', { version, idempotency_key })),
  retry: (id) => request<void>(`${path(id)}/retry`, json('POST')),
  prices: () => request<Purchase[]>('/price-changes'),
  summary: async () => {
    const summary = await request<Summary>('/dashboard/summary');
    if (!Array.isArray(summary.recent)) throw new Error('요약 API의 recent 목록을 확인해 주세요.');
    return { ...summary, recent: summary.recent.map(receiptFromWire) };
  },
  products: () => request<Product[]>('/products/matches'),
  saveProduct: (p) =>
    request<void>(
      '/products',
      json('POST', {
        id: p.id,
        name: p.name,
        unit: p.unit,
        category: p.category,
        aliases: p.aliases,
      }),
    ),
  sample: async () => {
    throw new Error('시연용 샘플은 데모 모드에서만 사용할 수 있습니다.');
  },
};
export const api = isDemo ? mockApi : httpApi;
const memberPath = (room: string) => `/chat/rooms/${encodeURIComponent(room)}/members`;
export const chatManagementApi: ChatManagementApi = isDemo
  ? mockChatManagement
  : {
      members: (room) => request<RoomMembership>(memberPath(room)),
      directory: () => request<ChatPerson[]>('/chat/users'),
      invite: (room, userIds) =>
        request<void>(memberPath(room), json('POST', { user_ids: userIds })),
      remove: (room, userId) =>
        request<void>(`${memberPath(room)}/${encodeURIComponent(userId)}`, json('DELETE')),
    };
const schedulePath = (id: string) => `/work-schedules/${encodeURIComponent(id)}`;
export const httpScheduleApi: ScheduleApi = {
  list: () => request<WorkSchedule[]>('/work-schedules'),
  get: (id) => request<WorkSchedule>(schedulePath(id)),
  employees: () => request<Employee[]>('/employees'),
  addEmployee: (name) => request<Employee>('/employees', json('POST', { name })),
  shifts: () => request<ConfirmedShift[]>('/shifts'),
  upload: (file, room) => {
    validateFile(file);
    const body = new FormData();
    body.append('file', file);
    body.append('room_id', room);
    body.append('document_type', 'WORK_SCHEDULE');
    return request<{ schedule_id: string }>('/work-schedules', { method: 'POST', body });
  },
  importText: (input) =>
    request<{ schedule_id: string }>('/work-schedules/from-text', json('POST', input)),
  save: (id, shifts, version) =>
    request<void>(schedulePath(id), json('PATCH', { shifts, version })),
  confirm: (id, version, idempotency_key) =>
    request<void>(`${schedulePath(id)}/confirm`, json('POST', { version, idempotency_key })),
  retry: (id) => request<void>(`${schedulePath(id)}/retry`, json('POST')),
  sample: async () => {
    throw new Error('가상 근무표는 데모 모드에서만 사용할 수 있습니다.');
  },
};
export const scheduleApi = isDemo ? mockScheduleApi : httpScheduleApi;
export const operationsApi: OperationsApi = isDemo
  ? mockOperationsApi
  : {
      menus: () => request<MenuCost[]>('/menus/costs'),
      saveMenu: (menu) =>
        request<MenuRecipe>(
          '/menus',
          json('POST', {
            id: menu.id,
            name: menu.name,
            selling_price: menu.selling_price,
            version: menu.version,
            ingredients: menu.ingredients.map((row) => ({
              id: row.id,
              product_id: row.product_id,
              quantity: row.quantity,
              unit: row.unit,
            })),
          }),
        ),
      deleteMenu: (id, version) =>
        request<void>(`/menus/${encodeURIComponent(id)}`, json('DELETE', { version })),
      receiving: () => request<ReceivingDocument[]>('/receiving'),
      saveReceiving: (doc) =>
        request<ReceivingDocument>(
          `/receiving/${encodeURIComponent(doc.receipt_id)}`,
          json('PATCH', {
            version: doc.version,
            received_on: doc.received_on,
            checked_by: doc.checked_by,
            completed: doc.completed,
            lines: doc.lines.map((line) => ({
              item_id: line.item_id,
              actual_quantity: line.actual_quantity,
              wrong_item: line.wrong_item,
              note: line.note,
            })),
          }),
        ),
    };
const wastePath = (id: string) => `/waste-records/${encodeURIComponent(id)}`;
export const wasteApi: WasteApi = isDemo
  ? mockWasteApi
  : {
      list: () => request<WasteRecord[]>('/waste-records'),
      save: (input) =>
        input.id
          ? request<WasteRecord>(wastePath(input.id), json('PATCH', input))
          : request<WasteRecord>('/waste-records', json('POST', input)),
      remove: (id, version) => request<void>(wastePath(id), json('DELETE', { version })),
    };
export function validateFile(file: File) {
  if (!['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(file.type))
    throw new Error('JPG, PNG, WebP, PDF 파일을 선택해 주세요. HEIC는 JPG로 변환해 주세요.');
  if (file.size === 0 || file.size > 10 * 1024 * 1024)
    throw new Error('파일은 0바이트보다 크고 10MB 이하여야 합니다.');
}

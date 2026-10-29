export class ApiError extends Error {
  constructor(message: string, public status: number, public code = '', public requestId = '', public fields: Record<string, string> = {}, public resultUnknown = false) {
    super(message); this.name = 'ApiError';
  }
}

// Treat error payloads as data; render strings through React, never as markup.
export function apiFailure(status: number, payload: unknown, headerId: string | null, login: boolean, write: boolean) {
  const root = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const body = root.error && typeof root.error === 'object' ? root.error as Record<string, unknown> : root;
  const fields: Record<string, string> = {};
  const raw = body.fields ?? body.field_errors;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [key, value] of Object.entries(raw).slice(0, 20)) {
      if (typeof value === 'string') fields[key] = value.slice(0, 500);
      else if (Array.isArray(value)) fields[key] = value.filter((v) => typeof v === 'string').join(' · ').slice(0, 500);
    }
  }
  const message = status === 401 ? login ? '이메일과 비밀번호를 확인해 주세요.' : '로그인이 만료되었습니다. 다시 로그인해 주세요.'
    : status === 403 ? '이 사업장에 접근할 권한이 없습니다.'
    : status === 404 ? '요청한 항목이 없거나 현재 사업장에서 접근할 수 없습니다.'
    : status === 409 ? '다른 변경 또는 중복 요청이 있습니다. 입력을 보관한 뒤 최신 내용을 다시 확인해 주세요.'
    : status === 429 ? '요청이 많습니다. 잠시 후 다시 시도해 주세요.'
    : typeof body.message === 'string' ? body.message.slice(0, 1000) : `요청에 실패했습니다. (${status}) 다시 시도해 주세요.`;
  return new ApiError(message, status, typeof body.code === 'string' ? body.code : '',
    headerId || (typeof root.request_id === 'string' ? root.request_id : typeof body.request_id === 'string' ? body.request_id : ''), fields, write && status >= 500);
}

export interface SessionUser { id: string; display_name: string; email?: string; }
export const demoUser: SessionUser = { id: 'local-demo', display_name: '데모 관리자' };

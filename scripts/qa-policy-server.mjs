// Local UI fixture only. This is not an authentication or production API server.
// Run: node scripts/qa-policy-server.mjs, then open the printed /receipts/qa-policy URL.
import { createServer } from 'vite';
process.env.VITE_API_MODE = 'http';
let authenticated = false;
let attempts = 0;
const user = { id: 'qa-user', display_name: 'QA 가상 사용자', email: 'qa@example.test' };
const product = { id: 'onion', name: 'QA 양파', unit: 'kg', category: '채소', aliases: [] };
const receipt = { receipt_id: 'qa-policy', room_id: 'qa-room', status: 'READY_TO_APPROVE', version: 1, upload_mode: 'PRINTED', document_kind: 'RECEIPT', input_style: 'PRINTED', has_price: true,
  supplier: { id: 'qa-supplier', name: 'QA 가상 거래처' }, purchased_at: '2026-10-27', created_at: '2026-10-27T09:00:00+09:00', image_url: null, file_name: 'QA 가상 영수증', file_type: 'image/png',
  items: [{ id: 'qa-item', raw_name: 'QA 양파', normalized_name: 'QA 양파', product_id: 'onion', quantity: 2, unit: 'kg', unit_price: 1000, line_total: 2000, currency: 'KRW', status: 'READY_TO_APPROVE', warnings: [], comparison: null, evidence_bbox: null }] };
const fixture = {
  name: 'local-policy-qa-fixture',
  configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (!req.url?.startsWith('/api/v1/')) return next();
      res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store');
      const path = new URL(req.url, 'http://localhost').pathname.slice('/api/v1'.length);
      const reply = (status, data) => { res.statusCode = status; res.end(status === 204 ? undefined : JSON.stringify(data)); };
      let raw = ''; for await (const chunk of req) raw += chunk;
      const body = raw ? JSON.parse(raw) : {};
      if (path === '/auth/login') {
        if (body.email !== 'qa@example.test' || body.password !== 'qa-only-password') return reply(401, {});
        authenticated = true; return reply(200, user);
      }
      if (path === '/auth/logout') { authenticated = false; return reply(204); }
      if (!authenticated) return reply(401, {});
      if (path === '/auth/me') return reply(200, user);
      if (path === '/workspaces') return reply(200, [{ id: 'busan-default', name: 'QA 가상 사업장', address: '', room_id: 'qa-room' }]);
      if (path === '/dashboard/summary') return reply(200, { processing: 0, review: 0, approved: 0, total: 1, recent: [receipt] });
      if (path === '/products/matches') return reply(200, [product]);
      if (path === '/receipts/qa-policy/items/qa-item' && req.method === 'PATCH') {
        attempts++;
        if (attempts === 1) { authenticated = false; return reply(401, {}); }
        if (attempts === 2) return reply(422, { error: { code: 'INVALID_QUANTITY', message: '가상 필드 오류입니다. 수량을 다시 확인해 주세요.', fields: { quantity: 'QA 필드 오류: 실제 수량을 확인해 주세요.' } }, request_id: 'qa-fields-422' });
        if (attempts === 3) { res.setHeader('X-Request-Id', 'qa-unknown-503'); return reply(503, { error: { message: '가상 서버 응답 지연입니다.' } }); }
        Object.assign(receipt.items[0], body); receipt.version++; return reply(204);
      }
      if (path === '/receipts/qa-policy') return reply(200, receipt);
      if (['/price-changes', '/menus/costs', '/receiving', '/employees', '/shifts', '/work-schedules'].includes(path)) return reply(200, []);
      if (path === '/chat/rooms') return reply(200, [{ id: 'qa-room', name: 'QA 가상 채팅방', created_at: receipt.created_at }]);
      if (path === '/rooms/qa-room/messages') return reply(200, []);
      return reply(404, { error: { message: 'QA에 없는 항목입니다.' } });
    });
  },
};
const server = await createServer({ plugins: [fixture], server: { host: '127.0.0.1', port: 5190, strictPort: true } });
await server.listen();
console.log('Local synthetic policy QA: http://127.0.0.1:5190/receipts/qa-policy');

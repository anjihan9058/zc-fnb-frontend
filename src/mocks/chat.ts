import { get, update } from 'idb-keyval';
import type { ChatManagementApi, ChatPerson, RoomMembership } from '../shared/chat';
import { demoUser } from '../shared/auth';
import { workspaceStorageKey } from '../shared/workspaces';
import { mockApi } from './api';

// Demo participants are local fixtures, never real invitations or employee/auth mappings.
const people: ChatPerson[] = [
  { id: demoUser.id, name: demoUser.display_name, role: 'OWNER' },
  { id: 'demo-kitchen', name: '주방 담당 (데모)', role: 'MEMBER' },
  { id: 'demo-floor', name: '홀 담당 (데모)', role: 'MEMBER' },
  { id: 'demo-manager', name: '매니저 (데모)', role: 'MEMBER' },
];
type Members = Record<string, ChatPerson[]>;
const storageKey = () => workspaceStorageKey('zcfnb-chat-members-v1');
async function check(room?: string) {
  if (!navigator.onLine) throw new Error('인터넷 연결 후 다시 시도해 주세요.');
  if (room && !(await mockApi.rooms()).some((r) => r.id === room))
    throw new Error('접근할 수 없는 채팅방입니다.');
}
const initial = () => [structuredClone(people[0])];
export const mockChatManagement: ChatManagementApi = {
  directory: async () => {
    await check();
    return structuredClone(people);
  },
  members: async (room): Promise<RoomMembership> => {
    await check(room);
    const saved = await get<Members>(storageKey());
    return { members: saved?.[room] ?? initial(), can_invite: true, can_remove: true };
  },
  invite: async (room, ids) => {
    await check(room);
    if (!ids.length || ids.some((id) => !people.some((p) => p.id === id)))
      throw new Error('사업장 구성원을 선택해 주세요.');
    await update<Members>(storageKey(), (old) => {
      const saved = old ?? {},
        members = saved[room] ?? initial();
      return {
        ...saved,
        [room]: [
          ...members,
          ...people.filter((p) => ids.includes(p.id) && !members.some((m) => m.id === p.id)),
        ],
      };
    });
  },
  remove: async (room, userId) => {
    await check(room);
    if (userId === demoUser.id || people.find((p) => p.id === userId)?.role === 'OWNER')
      throw new Error('방장은 내보낼 수 없습니다.');
    await update<Members>(storageKey(), (old) => {
      const saved = old ?? {},
        members = saved[room] ?? initial();
      if (!members.some((m) => m.id === userId)) throw new Error('이미 나간 참여자입니다.');
      return { ...saved, [room]: members.filter((m) => m.id !== userId) };
    });
  },
};

import { get, update } from 'idb-keyval';
import { createId } from './id';

export interface Workspace { id: string; name: string; address: string; room_id: string; }
export const defaultWorkspace: Workspace = { id: 'busan-default', name: '부산 한 끼', address: '', room_id: 'room_demo_01' };
const LIST_KEY = 'zcfnb-workspaces-v1';
const ACTIVE_KEY = 'zcfnb-active-workspace';
function readSelection() {
  try { return sessionStorage.getItem(ACTIVE_KEY) || defaultWorkspace.id; }
  catch { return defaultWorkspace.id; }
}
// Selection is fixed for this page lifetime. Switching reloads the app and its query cache.
let activeId = readSelection();
export const getWorkspaceId = () => activeId;
export const workspaceStorageKey = (legacyKey: string) => activeId === defaultWorkspace.id ? legacyKey : `${legacyKey}:${activeId}`;
export function selectWorkspace(id: string, activate = false) {
  sessionStorage.setItem(ACTIVE_KEY, id);
  if (activate) activeId = id;
}
export const localWorkspaces = {
  list: async (): Promise<Workspace[]> => await get<Workspace[]>(LIST_KEY) ?? [defaultWorkspace],
  create: async (name: string, address: string): Promise<Workspace> => {
    if (!name.trim() || name.trim().length > 60) throw new Error('사업장 이름은 1~60자로 입력해 주세요.');
    if (address.length > 200) throw new Error('주소는 200자 이내로 입력해 주세요.');
    const id = createId();
    const workspace = { id, name: name.trim(), address: address.trim(), room_id: `room_${id}` };
    await update<Workspace[]>(LIST_KEY, (saved) => {
      const list = saved ?? [defaultWorkspace];
      if (list.some((item) => item.name.toLocaleLowerCase() === workspace.name.toLocaleLowerCase())) throw new Error('같은 이름의 사업장이 있습니다. 지점명을 함께 입력해 주세요.');
      return [...list, workspace];
    });
    return workspace;
  },
};

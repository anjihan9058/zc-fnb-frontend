import { createContext, useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { workspaceApi } from '../shared/api';
import { defaultWorkspace, getWorkspaceId, selectWorkspace, type Workspace } from '../shared/workspaces';
import { ErrorState, Loading } from '../shared/ui';

const WorkspaceContext = createContext<Workspace>(defaultWorkspace);
export const useWorkspace = () => useContext(WorkspaceContext);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const query = useQuery({
    queryKey: ['workspaces'],
    queryFn: async () => {
      const workspaces = await workspaceApi.list();
      if (!workspaces.length) throw new Error('접근 가능한 사업장이 없습니다. 관리자에게 사업장 등록을 요청해 주세요.');
      const selected = workspaces.find((w) => w.id === getWorkspaceId()) ?? workspaces[0];
      if (selected.id !== getWorkspaceId()) selectWorkspace(selected.id, true);
      return workspaces;
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  if (query.isPending) return <Loading />;
  if (query.error) return <ErrorState error={query.error} retry={() => query.refetch()} />;
  const selected = query.data.find((w) => w.id === getWorkspaceId());
  if (!selected) return <ErrorState error={new Error('사업장을 다시 선택해 주세요.')} retry={() => query.refetch()} />;
  return <WorkspaceContext.Provider value={selected}>{children}</WorkspaceContext.Provider>;
}

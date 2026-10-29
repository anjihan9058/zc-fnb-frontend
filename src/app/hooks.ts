import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, scheduleApi, operationsApi, wasteApi } from '../shared/api';
export const useMenuCosts = () =>
  useQuery({ queryKey: ['menu-costs'], queryFn: operationsApi.menus, refetchInterval: 10000 });
export const useWasteRecords = () =>
  useQuery({ queryKey: ['waste-records'], queryFn: wasteApi.list });
export const useReceiving = () =>
  useQuery({ queryKey: ['receiving'], queryFn: operationsApi.receiving, refetchInterval: 10000 });
export const useWorkSchedule = (id: string) =>
  useQuery({
    queryKey: ['work-schedule', id],
    queryFn: () => scheduleApi.get(id),
    refetchInterval: (q) =>
      ['UPLOADED', 'PROCESSING'].includes(q.state.data?.status ?? '') ? 2000 : false,
  });
export const useSummary = () =>
  useQuery({ queryKey: ['summary'], queryFn: api.summary, refetchInterval: 4000 });
export const usePrices = () => useQuery({ queryKey: ['prices'], queryFn: api.prices });
export const useProducts = () => useQuery({ queryKey: ['products'], queryFn: api.products });
export const useReceipt = (id: string) =>
  useQuery({
    queryKey: ['receipt', id],
    queryFn: () => api.receipt(id),
    refetchInterval: (q) =>
      ['PROCESSING', 'UPLOADED'].includes(q.state.data?.status ?? '') ? 2000 : false,
  });
export const useRefresh = () => {
  const query = useQueryClient();
  return () =>
    query.invalidateQueries({
      predicate: (item) => !['workspaces', 'session'].includes(String(item.queryKey[0])),
    });
};

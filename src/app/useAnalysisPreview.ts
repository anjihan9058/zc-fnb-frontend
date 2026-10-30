import { useMemo, useState, useSyncExternalStore } from 'react';
import { useWorkspace } from './WorkspaceProvider';
import { isDemo } from '../shared/api';
import { today } from '../shared/format';
import { createAnalysisDemo } from '../mocks/analytics';
import { shiftMonth, type AnalysisDataset, type FinancialMonth } from '../shared/analytics';
import {
  decodeFinancialInputs,
  readFinancialInputs,
  subscribeFinancialInputs,
  writeFinancialInput,
} from '../shared/financialInputs';

export function useAnalysisPreview() {
  const workspace = useWorkspace(),
    anchor = today().slice(0, 7);
  const [selected, setSelected] = useState({ workspace: workspace.id, month: anchor });
  const [mode, setMode] = useState<'demo' | 'missing'>(isDemo ? 'demo' : 'missing');
  const month = selected.workspace === workspace.id ? selected.month : anchor;
  const sample = useMemo(() => createAnalysisDemo(workspace.id, anchor), [workspace.id, anchor]);
  const rawInputs = useSyncExternalStore(subscribeFinancialInputs, () =>
    readFinancialInputs(workspace.id),
  );
  const inputs = useMemo(() => decodeFinancialInputs(rawInputs), [rawInputs]);
  const dataset: AnalysisDataset = useMemo(
    () =>
      mode === 'demo'
        ? {
            ...sample,
            financials: sample.financials.map((row) => inputs[row.month] ?? row),
          }
        : { ...sample, costs: [], financials: [] },
    [sample, mode, inputs],
  );
  const months = Array.from({ length: 12 }, (_, i) => shiftMonth(anchor, -i));
  return {
    workspace,
    month,
    setMonth: (value: string) => {
      if (months.includes(value)) setSelected({ workspace: workspace.id, month: value });
    },
    months,
    mode,
    setMode,
    dataset,
    hasFinancialInput: mode === 'demo' && !!inputs[month],
    saveFinancialInput: (row: FinancialMonth) => {
      if (mode !== 'demo' || row.month !== month)
        throw new Error('선택한 월의 테스트 입력만 저장할 수 있습니다.');
      writeFinancialInput(workspace.id, month, row);
    },
    resetFinancialInput: () => writeFinancialInput(workspace.id, month, null),
  };
}
export type AnalysisPreviewModel = ReturnType<typeof useAnalysisPreview>;

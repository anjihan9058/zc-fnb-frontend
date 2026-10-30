import { useMemo, useState } from 'react';
import { useWorkspace } from './WorkspaceProvider';
import { isDemo } from '../shared/api';
import { today } from '../shared/format';
import { createAnalysisDemo } from '../mocks/analytics';
import { shiftMonth, type AnalysisDataset } from '../shared/analytics';

export function useAnalysisPreview() {
  const workspace = useWorkspace(),
    anchor = today().slice(0, 7);
  const [selected, setSelected] = useState({ workspace: workspace.id, month: anchor });
  const [mode, setMode] = useState<'demo' | 'missing'>(isDemo ? 'demo' : 'missing');
  const month = selected.workspace === workspace.id ? selected.month : anchor;
  const sample = useMemo(() => createAnalysisDemo(workspace.id, anchor), [workspace.id, anchor]);
  const dataset: AnalysisDataset = useMemo(
    () => (mode === 'demo' ? sample : { ...sample, costs: [], financials: [] }),
    [sample, mode],
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
  };
}
export type AnalysisPreviewModel = ReturnType<typeof useAnalysisPreview>;

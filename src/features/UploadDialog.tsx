import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ArrowRight, Camera, FileImage, FileText, UploadCloud } from 'lucide-react';
import { api, isDemo, validateFile } from '../shared/api';
import type { UploadDocumentType } from '../shared/types';
import { ErrorState, Modal, useToast } from '../shared/ui';
import { useRefresh } from '../app/hooks';
import { ScheduleTextDialog } from './ScheduleTextDialog';

type Props = { room: string; close: () => void; initialType?: UploadDocumentType };
export function UploadDialog({ initialType, ...props }: Props) {
  return initialType === 'WORK_SCHEDULE' ? (
    <ScheduleTextDialog text="" {...props} />
  ) : (
    <ReceiptUploadDialog {...props} />
  );
}
function ReceiptUploadDialog({ room, close }: Omit<Props, 'initialType'>) {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const refresh = useRefresh();
  const toast = useToast();
  useEffect(() => {
    if (!file?.type.startsWith('image/')) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const upload = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('영수증 파일을 선택해 주세요.');
      validateFile(file);
      return api.upload(file, room);
    },
    onSuccess: async () => {
      await refresh();
      toast('영수증을 접수했습니다.');
      close();
    },
  });
  const sample = useMutation({
    mutationFn: (scenario: string) => api.sample(scenario, room),
    onSuccess: async () => {
      await refresh();
      toast('가상 영수증을 준비했습니다.');
      close();
    },
  });
  const busy = upload.isPending || sample.isPending;
  function select(selected?: File) {
    if (!selected) return;
    try {
      validateFile(selected);
      setFile(selected);
      setError(null);
      upload.reset();
    } catch (failure) {
      setError(failure as Error);
      setFile(null);
    }
  }
  return (
    <Modal title="영수증 올리기" dirty={!!file} busy={busy} close={close}>
      <p className="upload-intro">
        촬영하거나 파일을 첨부하세요. 문서 유형과 포함된 정보는 분석 결과에서 확인합니다.
      </p>
      <input
        ref={input}
        hidden
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        onChange={(e) => {
          select(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <input
        ref={camera}
        hidden
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          select(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <button
        className={`dropzone ${file ? 'has-file' : ''}`}
        disabled={busy}
        onClick={() => input.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (!busy) select(e.dataTransfer.files[0]);
        }}
      >
        {file ? <FileImage size={32} /> : <UploadCloud size={34} />}
        <strong>{file?.name ?? '영수증 파일을 선택하거나 끌어오세요'}</strong>
        <small>
          {file
            ? `${(file.size / 1024 / 1024).toFixed(2)} MB · 눌러서 변경`
            : 'JPG, PNG, WebP, PDF · 최대 10MB'}
        </small>
      </button>
      {previewUrl && (
        <div className="upload-file-preview">
          <img src={previewUrl} alt="전송 전 영수증 미리보기" />
          <span>글자와 모서리가 잘 보이는지 확인해 주세요.</span>
        </div>
      )}
      {file?.type === 'application/pdf' && <p className="info-box">PDF: {file.name}</p>}
      <div className="upload-actions">
        <button className="btn" disabled={busy} onClick={() => camera.current?.click()}>
          <Camera size={17} />
          사진 촬영
        </button>
        <button
          className="btn primary"
          disabled={!file || busy || !navigator.onLine}
          onClick={() => upload.mutate()}
        >
          {upload.isPending ? '전송 중…' : '영수증 전송'}
          <ArrowRight size={17} />
        </button>
      </div>
      {isDemo && (
        <div className="demo-samples">
          <div className="info-box">
            데모는 실제 OCR을 실행하지 않습니다. 실제 파일은 직접 입력하고 가상 샘플로 분석 흐름을
            체험할 수 있습니다.
          </div>
          <h3>
            <FileText size={16} />
            파일 없이 기능 체험
          </h3>
          <div className="sample-buttons">
            {[
              ['normal', '정상 영수증'],
              ['anomaly', '가격 급변'],
              ['missing', '단가 누락'],
              ['mismatch', '금액 불일치'],
              ['unknown', '규격 미확인'],
              ['failed', '분석 실패'],
            ].map(([value, label]) => (
              <button
                className="btn small"
                key={value}
                disabled={busy || !navigator.onLine}
                onClick={() => sample.mutate(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      {(error || upload.error || sample.error) && (
        <ErrorState error={error || upload.error || sample.error} />
      )}
    </Modal>
  );
}

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Forward, Link2, Reply, Share2, Trash2 } from 'lucide-react';
import { api } from '../shared/api';
import { messageText } from '../shared/chat';
import type { Message } from '../shared/types';
import { ErrorState, Loading, Modal, useToast } from '../shared/ui';

export function MessageGesture({
  message,
  open,
  children,
}: {
  message: Message;
  open: (message: Message) => void;
  children: ReactNode;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    origin = useRef({ x: 0, y: 0 }),
    held = useRef(false);
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  useEffect(() => () => cancel(), []);
  return (
    <div
      className="messenger-message-body"
      onPointerDown={(e) => {
        if (message.deleted_at || !e.isPrimary || e.button !== 0) return;
        cancel();
        held.current = false;
        origin.current = { x: e.clientX, y: e.clientY };
        timer.current = setTimeout(() => {
          held.current = true;
          open(message);
        }, 500);
      }}
      onPointerMove={(e) => {
        if (Math.hypot(e.clientX - origin.current.x, e.clientY - origin.current.y) > 10) cancel();
      }}
      onPointerUp={cancel}
      onPointerCancel={cancel}
      onPointerLeave={cancel}
      onClickCapture={(e) => {
        if (held.current) {
          e.preventDefault();
          e.stopPropagation();
          held.current = false;
        }
      }}
      onContextMenu={(e) => {
        if (!message.deleted_at) {
          e.preventDefault();
          cancel();
          open(message);
        }
      }}
    >
      {children}
    </div>
  );
}

async function copy(value: string) {
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      /* HTTP or permission fallback */
    }
  }
  const field = document.createElement('textarea');
  field.value = value;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.top = '0';
  field.style.left = '-9999px';
  (document.querySelector('dialog[open]') ?? document.body).append(field);
  field.select();
  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    /* Use visible selection below */
  } finally {
    field.remove();
  }
  return copied;
}
export function ChatMessageTools({
  message,
  roomId,
  close,
  reply,
}: {
  message: Message;
  roomId: string;
  close: () => void;
  reply: (message: Message) => void;
}) {
  const client = useQueryClient(),
    toast = useToast();
  const [mode, setMode] = useState<'actions' | 'forward' | 'delete' | 'copy'>('actions'),
    [destination, setDestination] = useState(''),
    [copyValue, setCopyValue] = useState(''),
    [error, setError] = useState<Error | null>(null);
  const rooms = useQuery({
    queryKey: ['chat-rooms'],
    queryFn: api.rooms,
    enabled: mode === 'forward',
  });
  const remove = useMutation({
    mutationFn: () => api.deleteMessage(roomId, message.id),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['messages', roomId] });
      toast('메시지를 삭제했습니다.');
      close();
    },
  });
  const forward = useMutation({
    mutationFn: () => {
      const value = `[전달 · ${message.author}]\n${messageText(message)}`;
      if (value.length > 50000)
        throw new Error('전달 가능한 길이를 넘었습니다. 복사를 이용해 내용을 나눠 보내 주세요.');
      return api.send(destination, value);
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['messages', destination] });
      toast('선택한 채팅방으로 전달했습니다.');
      close();
    },
  });
  async function copyValueToClipboard(value: string) {
    if (await copy(value)) {
      toast('복사했습니다.');
      close();
    } else {
      setCopyValue(value);
      setMode('copy');
    }
  }
  function messageUrl() {
    const url = new URL(`/rooms/${encodeURIComponent(roomId)}`, window.location.origin);
    url.searchParams.set('message', message.id);
    return url.href;
  }
  async function share() {
    setError(null);
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${message.author}의 메시지`,
          text: messageText(message),
          url: messageUrl(),
        });
        close();
        return;
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return;
      }
    }
    await copyValueToClipboard(`${messageText(message)}\n${messageUrl()}`);
  }
  const busy = remove.isPending || forward.isPending;
  return (
    <Modal
      title={
        mode === 'forward'
          ? '대화 전달'
          : mode === 'delete'
            ? '메시지 삭제'
            : mode === 'copy'
              ? '내용 복사'
              : '메시지'
      }
      close={close}
      busy={busy}
    >
      <blockquote className="chat-action-preview">
        <strong>{message.author}</strong>
        <p>
          {messageText(message).slice(0, 300)}
          {messageText(message).length > 300 ? '…' : ''}
        </p>
      </blockquote>
      {mode === 'actions' ? (
        <div className="chat-action-list">
          <button onClick={() => void copyValueToClipboard(messageText(message))}>
            <Copy size={20} />
            복사
          </button>
          <button
            onClick={() => {
              reply(message);
              close();
            }}
          >
            <Reply size={20} />
            답장
          </button>
          <button onClick={() => void share()}>
            <Share2 size={20} />
            공유
          </button>
          <button onClick={() => void copyValueToClipboard(messageUrl())}>
            <Link2 size={20} />
            대화 링크
          </button>
          <button onClick={() => setMode('forward')}>
            <Forward size={20} />
            전달
          </button>
          {message.own && !message.id.startsWith('schedule-message-') && (
            <button className="danger-text" onClick={() => setMode('delete')}>
              <Trash2 size={20} />
              삭제
            </button>
          )}
        </div>
      ) : mode === 'forward' ? (
        <>
          <p className="muted text-small">
            메시지 내용을 텍스트로 전달합니다. 첨부 원본·영수증 접근 권한은 전달하지 않습니다.
          </p>
          {rooms.isPending ? (
            <Loading />
          ) : rooms.error ? (
            <ErrorState error={rooms.error} retry={() => rooms.refetch()} />
          ) : (
            <div className="chat-forward-rooms">
              {rooms.data
                ?.filter((r) => r.id !== roomId)
                .map((r) => (
                  <label key={r.id}>
                    <input
                      type="radio"
                      name="forward-room"
                      checked={destination === r.id}
                      onChange={() => setDestination(r.id)}
                    />
                    {r.name}
                  </label>
                ))}
              {!rooms.data?.some((r) => r.id !== roomId) && (
                <p className="muted">전달할 다른 채팅방이 없습니다.</p>
              )}
            </div>
          )}
          <button
            className="btn primary full"
            disabled={!destination || busy || !navigator.onLine}
            onClick={() => forward.mutate()}
          >
            {busy ? '전달 중…' : '선택한 채팅방으로 전달'}
          </button>
        </>
      ) : mode === 'delete' ? (
        <>
          <p className="chat-delete-note">
            대화에서 이 메시지를 삭제합니다. 연결된 영수증·근무표와 확정 기록은 유지됩니다.
          </p>
          <button
            className="btn danger full"
            disabled={busy || !navigator.onLine}
            onClick={() => remove.mutate()}
          >
            메시지 삭제
          </button>
        </>
      ) : (
        <>
          <p className="muted text-small">내용을 선택한 뒤 기기의 복사 메뉴를 사용해 주세요.</p>
          <textarea
            className="chat-copy-fallback"
            readOnly
            value={copyValue}
            onFocus={(e) => e.currentTarget.select()}
          />
        </>
      )}
      {(error || remove.error || forward.error) && (
        <ErrorState error={error || remove.error || forward.error} />
      )}
    </Modal>
  );
}

export function HighlightedMessage({ text, keyword }: { text: string; keyword: string }) {
  if (!keyword.trim()) return <>{text}</>;
  const term = keyword.trim(),
    lower = text.toLocaleLowerCase(),
    needle = term.toLocaleLowerCase();
  const nodes: ReactNode[] = [];
  let from = 0,
    index = lower.indexOf(needle);
  while (index !== -1) {
    nodes.push(
      text.slice(from, index),
      <mark key={index}>{text.slice(index, index + term.length)}</mark>,
    );
    from = index + term.length;
    index = lower.indexOf(needle, from);
  }
  nodes.push(text.slice(from));
  return <>{nodes}</>;
}

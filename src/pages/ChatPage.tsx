import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowDown,
  ChevronDown,
  ChevronUp,
  Megaphone,
  MoreHorizontal,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Camera,
  Check,
  FileText,
  Menu,
  MessageCircle,
  Paperclip,
  Plus,
  ReceiptText,
  Search,
  Send,
  Smile,
  Sparkles,
  X,
} from 'lucide-react';
import { useWorkspace } from '../app/WorkspaceProvider';
import { api, chatManagementApi, isDemo, validateFile, scheduleApi } from '../shared/api';
import { useReceipt, useRefresh } from '../app/hooks';
import { Badge, Empty, ErrorState, Loading, Modal, useToast } from '../shared/ui';
import { timeLabel, won } from '../shared/format';
import type { Message, UploadDocumentType } from '../shared/types';
import { UploadDialog } from '../features/UploadDialog';
import { ScheduleCard } from './SchedulesPage';
import { ScheduleTextDialog } from '../features/ScheduleTextDialog';
import { looksLikeSchedule } from '../shared/scheduleText';
import { useChatViewport } from '../app/useChatViewport';
import { ChatMembers } from '../features/ChatMembers';
import { ChatMessageTools, HighlightedMessage, MessageGesture } from '../features/ChatMessageTools';
import { messageMatches, messageText } from '../shared/chat';

function dayOf(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '날짜 미확인'
    : date.toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
        timeZone: 'Asia/Seoul',
      });
}
export function ChatPage() {
  useChatViewport();
  const workspace = useWorkspace();
  const { roomId = workspace.room_id } = useParams();
  const navigate = useNavigate();
  const [showRooms, setShowRooms] = useState(false);
  const [roomSearch, setRoomSearch] = useState('');
  const [newRoom, setNewRoom] = useState<string | null>(null);
  const refresh = useRefresh();
  const rooms = useQuery({ queryKey: ['chat-rooms'], queryFn: api.rooms, refetchInterval: 10000 });
  const create = useMutation({
    mutationFn: () => api.createRoom(newRoom ?? ''),
    onSuccess: async (room) => {
      await refresh();
      flushSync(() => setNewRoom(null));
      navigate(`/rooms/${encodeURIComponent(room.id)}`);
      setShowRooms(false);
    },
  });
  const room = rooms.data?.find((r) => r.id === roomId);
  return (
    <div className={`chat-page messenger-page ${showRooms ? 'show-rooms' : ''}`}>
      <aside className="messenger-rooms" aria-label="팀 채팅방 목록">
        <div className="messenger-rooms-heading">
          <div>
            <small>{workspace.name}</small>
            <h1>채팅</h1>
          </div>
          <button className="icon-btn" aria-label="새 채팅방 만들기" onClick={() => setNewRoom('')}>
            <MessageCircle size={22} />
            <Plus size={12} />
          </button>
        </div>
        <label className="messenger-room-search">
          <Search size={16} />
          <input
            aria-label="채팅방 검색"
            placeholder="채팅방 이름 검색"
            value={roomSearch}
            onChange={(e) => setRoomSearch(e.target.value)}
          />
        </label>
        <div className="messenger-room-list">
          {rooms.isPending && <Loading />}
          {rooms.error && <ErrorState error={rooms.error} retry={() => rooms.refetch()} />}
          {rooms.data
            ?.filter((r) => r.name.includes(roomSearch))
            .map((r) => (
              <button
                key={r.id}
                className={r.id === roomId ? 'active' : ''}
                aria-current={r.id === roomId ? 'page' : undefined}
                onClick={() => {
                  navigate(`/rooms/${encodeURIComponent(r.id)}`);
                  setShowRooms(false);
                }}
              >
                <span className="messenger-room-avatar">
                  <MessageCircle size={25} />
                </span>
                <span>
                  <strong>{r.name}</strong>
                  <small>{workspace.name} · 팀 채팅방</small>
                </span>
                {r.id === roomId && <Check size={15} />}
              </button>
            ))}
          {rooms.data && !rooms.data.some((r) => r.name.includes(roomSearch)) && (
            <p className="messenger-search-empty">검색한 채팅방이 없습니다.</p>
          )}
        </div>
        <div className="messenger-rooms-footer">
          <Link to="/dashboard">
            <ArrowLeft size={15} />
            가게 대시보드
          </Link>
          <span>{isDemo ? '이 브라우저에 저장되는 데모' : '우리 팀의 업무 공간'}</span>
        </div>
      </aside>
      {rooms.isPending ? (
        <Loading />
      ) : rooms.error ? (
        <ErrorState error={rooms.error} retry={() => rooms.refetch()} />
      ) : room ? (
        <Conversation
          key={roomId}
          roomId={roomId}
          name={room.name}
          openRooms={() => setShowRooms(true)}
        />
      ) : (
        <div className="messenger-unavailable">
          <Empty title="채팅방을 찾을 수 없습니다">
            <button className="btn" onClick={() => setShowRooms(true)}>
              채팅방 목록 보기
            </button>
          </Empty>
        </div>
      )}
      {newRoom !== null && (
        <Modal
          title="새 채팅방"
          dirty={!!newRoom.trim()}
          busy={create.isPending}
          close={() => setNewRoom(null)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (newRoom.trim() && !create.isPending) create.mutate();
            }}
          >
            <label className="field">
              채팅방 이름
              <input
                autoFocus
                maxLength={60}
                value={newRoom}
                onChange={(e) => setNewRoom(e.target.value)}
                placeholder="예: 주방 입고 이야기"
              />
            </label>
            {create.error && <ErrorState error={create.error} />}
            <button
              className="btn primary full"
              disabled={!newRoom.trim() || create.isPending || !navigator.onLine}
            >
              {create.isPending ? '만드는 중…' : '채팅방 만들기'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Conversation({
  roomId,
  name,
  openRooms,
}: {
  roomId: string;
  name: string;
  openRooms: () => void;
}) {
  const [params] = useSearchParams();
  const targetMessage = params.get('message');
  const focusedMessage = useRef<string | null>(null);
  const workspace = useWorkspace();
  const [text, setText] = useState('');
  const [upload, setUpload] = useState<UploadDocumentType | null>(null);
  const [attachments, setAttachments] = useState(false);
  const [emojis, setEmojis] = useState(false);
  const [menu, setMenu] = useState(false);
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState('');
  const [activeSearchId, setActiveSearchId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [actions, setActions] = useState<Message | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const lastSearch = useRef('');
  const [newMessages, setNewMessages] = useState(false);
  const [scrolledUp, setScrolledUp] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<Error | null>(null);
  const [preview, setPreview] = useState<Message['attachment'] | null>(null);
  const [scheduleText, setScheduleText] = useState<{ text: string; messageId?: string } | null>(
    null,
  );
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (replyTo) input.current?.focus({ preventScroll: true });
  }, [replyTo]);
  const searchInput = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (searching) searchInput.current?.focus({ preventScroll: true });
  }, [searching]);
  const scroller = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const nearBottom = useRef(true);
  const first = useRef(true);
  const forceBottom = useRef(false);
  const previousLast = useRef<string | undefined>(undefined);
  const refresh = useRefresh();
  const toast = useToast();
  const messages = useQuery({
    queryKey: ['messages', roomId],
    queryFn: () => api.messages(roomId),
    refetchInterval: 4000,
  });
  // Shares the cache with the member list in the room drawer.
  const members = useQuery({
    queryKey: ['room-members', roomId],
    queryFn: () => chatManagementApi.members(roomId),
  });
  const scheduleDocuments = useQuery({
    queryKey: ['work-schedules'],
    queryFn: scheduleApi.list,
    refetchInterval: 10000,
  });
  const send = useMutation({
    mutationFn: ({ value, reply }: { value: string; reply?: string }) =>
      api.send(roomId, value, reply),
    onSuccess: async (_message, sent) => {
      setText((draft) => (draft === sent.value ? '' : draft));
      setReplyTo((current) => (current?.id === sent.reply ? null : current));
      forceBottom.current = true;
      await refresh();
      input.current?.focus({ preventScroll: true });
    },
  });
  const attach = useMutation({
    mutationFn: async (replyId?: string) => {
      if (!file) throw new Error('파일을 선택해 주세요.');
      validateFile(file);
      return api.attach(roomId, file, replyId);
    },
    onSuccess: async (_message, replyId) => {
      setFile(null);
      setReplyTo((current) => (current?.id === replyId ? null : current));
      setAttachments(false);
      forceBottom.current = true;
      await refresh();
      toast('파일을 보냈습니다.');
    },
  });
  const busy = send.isPending || attach.isPending;
  const timeline = messages.data ?? [];
  const searchResults = search.trim() ? timeline.filter((m) => messageMatches(m, search)) : [];
  const searchIndex = searchResults.findIndex((m) => m.id === activeSearchId);
  // KakaoTalk-style: the message you jump to is briefly shaded, then fades.
  function flashMessage(id: string) {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    setFlash(id);
    flashTimer.current = setTimeout(() => setFlash(null), 1800);
  }
  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );
  function closeSearch() {
    searchInput.current?.blur();
    setSearching(false);
    setSearch('');
  }
  function jumpToMessage(id: string, behavior: ScrollBehavior = 'smooth') {
    const container = scroller.current,
      target = document.getElementById('message-' + id);
    if (!container || !target) {
      toast('이 대화 기록을 찾을 수 없습니다.');
      return;
    }
    nearBottom.current = false;
    first.current = false;
    forceBottom.current = false;
    container.scrollTo({
      top:
        container.scrollTop +
        target.getBoundingClientRect().top -
        container.getBoundingClientRect().top -
        container.clientHeight / 3,
      behavior,
    });
    flashMessage(id);
  }
  useEffect(() => {
    if (!search.trim()) {
      setActiveSearchId(null);
      lastSearch.current = '';
      return;
    }
    const latest = searchResults.at(-1);
    if (!latest) {
      setActiveSearchId(null);
      return;
    }
    if (
      lastSearch.current !== search.trim() ||
      !activeSearchId ||
      !searchResults.some((m) => m.id === activeSearchId)
    ) {
      lastSearch.current = search.trim();
      setActiveSearchId(latest.id);
      jumpToMessage(latest.id, 'auto');
    }
  }, [search, messages.data, activeSearchId]);
  function moveSearch(direction: number) {
    const next = searchResults[searchIndex + direction];
    if (next) {
      setActiveSearchId(next.id);
      jumpToMessage(next.id);
    }
  }
  function scrollDown(behavior: ScrollBehavior = 'smooth') {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior });
    setNewMessages(false);
    setScrolledUp(false);
    nearBottom.current = true;
  }
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const follow = () => {
      if (nearBottom.current) scrollDown('auto');
    };
    const size = new ResizeObserver(follow);
    const content = new MutationObserver(follow);
    size.observe(element);
    content.observe(element, { childList: true, subtree: true, characterData: true });
    return () => {
      size.disconnect();
      content.disconnect();
    };
  }, [roomId]);
  useLayoutEffect(() => {
    if (!messages.data) return;
    if (targetMessage && focusedMessage.current !== targetMessage) {
      const target = document.getElementById(`message-${targetMessage}`),
        container = scroller.current;
      if (target && container) {
        focusedMessage.current = targetMessage;
        flashMessage(targetMessage);
        first.current = false;
        nearBottom.current = false;
        container.scrollTo({
          top:
            container.scrollTop +
            target.getBoundingClientRect().top -
            container.getBoundingClientRect().top -
            container.clientHeight / 3,
          behavior: 'auto',
        });
        previousLast.current = messages.data.at(-1)?.id;
        return;
      }
    }
    const last = messages.data.at(-1)?.id;
    if (first.current || nearBottom.current || forceBottom.current) {
      scrollDown(first.current ? 'auto' : 'smooth');
      first.current = false;
      forceBottom.current = false;
    } else if (previousLast.current !== last) setNewMessages(true);
    previousLast.current = last;
  }, [messages.data, targetMessage]);
  useLayoutEffect(() => {
    const el = input.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }
  }, [text]);
  function selectFile(selected?: File) {
    if (!selected) return;
    try {
      validateFile(selected);
      setFile(selected);
      setFileError(null);
      attach.reset();
      setAttachments(false);
    } catch (error) {
      setFileError(error as Error);
    }
  }
  function submit() {
    if (text.trim() && !busy && navigator.onLine && !file)
      send.mutate({ value: text, reply: replyTo?.id });
  }
  return (
    <section className="messenger-conversation" aria-label={`${name} 대화`}>
      <header className="messenger-header" data-searching={searching}>
        {searching ? (
          <>
            <button className="icon-btn" aria-label="검색 닫기" onClick={closeSearch}>
              <ArrowLeft size={24} />
            </button>
            <label className="messenger-search">
              <Search size={17} />
              <input
                ref={searchInput}
                type="search"
                enterKeyHint="search"
                value={search}
                onChange={(e) => {
                  nearBottom.current = false;
                  first.current = false;
                  setSearch(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') closeSearch();
                  if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
                  e.preventDefault();
                  // Phones: hide the keyboard so the result is visible. Desktop: step to older results.
                  if (window.matchMedia('(max-width: 760px)').matches) e.currentTarget.blur();
                  else moveSearch(e.shiftKey ? 1 : -1);
                }}
                aria-label="대화 내용 검색"
                placeholder="대화 내용 검색"
              />
            </label>
          </>
        ) : (
          <>
            <button
              className="icon-btn messenger-back"
              aria-label="채팅방 목록"
              onClick={openRooms}
            >
              <ArrowLeft size={24} />
            </button>
            <span className="messenger-header-avatar">
              <MessageCircle size={22} />
            </span>
            <div className="messenger-header-title">
              <h2>
                {name}
                {members.data && (
                  <span
                    className="messenger-member-count"
                    aria-label={`참여자 ${members.data.members.length}명`}
                  >
                    {members.data.members.length}
                  </span>
                )}
              </h2>
              <span>
                {workspace.name}
                {isDemo ? ' · 로컬 데모' : ''}
              </span>
            </div>
            <button
              className="icon-btn"
              aria-label="대화 검색"
              aria-expanded={searching}
              onClick={() => {
                setSearching(true);
                setAttachments(false);
                setEmojis(false);
              }}
            >
              <Search size={21} />
            </button>
            <button
              className="icon-btn"
              aria-label="채팅방 메뉴"
              aria-haspopup="dialog"
              onClick={() => setMenu(true)}
            >
              <Menu size={23} />
            </button>
          </>
        )}
      </header>
      <div className="messenger-history-wrap">
        {!searching && (
          <div className="messenger-notice">
            <Megaphone size={16} />
            <span>영수증은 확인 후 구매가격에 반영됩니다.</span>
          </div>
        )}
        <div
          className="messages messenger-history"
          ref={scroller}
          role="log"
          aria-label="채팅 메시지"
          aria-live="polite"
          aria-relevant="additions"
          onScroll={() => {
            const el = scroller.current;
            if (el) {
              nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
              if (nearBottom.current) setNewMessages(false);
              // KakaoTalk shows the jump-down button only after you scroll up.
              setScrolledUp(el.scrollHeight - el.scrollTop - el.clientHeight > 240);
            }
          }}
          onLoad={() => {
            if (nearBottom.current) scrollDown('auto');
          }}
        >
          {messages.isPending && <Loading />}
          {messages.error && <ErrorState error={messages.error} retry={() => messages.refetch()} />}
          {messages.data?.length === 0 && (
            <div className="messenger-empty">
              <MessageCircle size={35} />
              <strong>편하게 이야기 나눠요</strong>
              <p>
                입고된 영수증도, 오늘의 가게 이야기도
                <br />
                이곳에 남겨 주세요.
              </p>
            </div>
          )}
          {timeline.map((message, index) => {
            const before = timeline[index - 1],
              after = timeline[index + 1];
            const day = dayOf(message.created_at);
            const newDay = !before || dayOf(before.created_at) !== day;
            const continuation =
              !newDay &&
              before?.author === message.author &&
              before?.own === message.own &&
              !before?.receipt_id &&
              !before?.schedule_id &&
              Math.abs(Date.parse(message.created_at) - Date.parse(before.created_at)) < 5 * 60000;
            const showTime =
              !after ||
              after.author !== message.author ||
              after.own !== message.own ||
              timeLabel(after.created_at) !== timeLabel(message.created_at) ||
              dayOf(after.created_at) !== day;
            return (
              <Fragment key={message.id}>
                {newDay && (
                  <div className="chat-date messenger-date">
                    <span>{day}</span>
                  </div>
                )}
                <div
                  id={`message-${message.id}`}
                  className={`message ${message.own ? 'own' : ''} ${continuation ? 'continued' : ''} ${(activeSearchId ?? targetMessage) === message.id ? 'message-target' : ''} ${flash === message.id ? 'message-flash' : ''}`}
                >
                  {!message.own && (
                    <span className={`message-avatar ${continuation ? 'invisible' : ''}`}>
                      {message.receipt_id || message.schedule_id ? (
                        <Sparkles size={20} />
                      ) : (
                        message.author.slice(0, 1)
                      )}
                    </span>
                  )}
                  <div className="message-content">
                    {!message.own && !continuation && (
                      <div className="message-author">{message.author}</div>
                    )}
                    <div className="messenger-message-line">
                      <MessageGesture message={message} open={setActions}>
                        {message.reply_to && (
                          <button
                            className="chat-message-quote"
                            onClick={() => jumpToMessage(message.reply_to!.id)}
                          >
                            <strong>{message.reply_to.author}에게 답장</strong>
                            <small>
                              {timeline.find((m) => m.id === message.reply_to!.id)?.deleted_at
                                ? '삭제된 메시지입니다.'
                                : message.reply_to.text}
                            </small>
                          </button>
                        )}
                        {message.deleted_at ? (
                          <div className="message-bubble chat-deleted-message">
                            삭제된 메시지입니다.
                          </div>
                        ) : message.schedule_id ? (
                          <ScheduleCard id={message.schedule_id} />
                        ) : message.receipt_id ? (
                          <ReceiptCard id={message.receipt_id} />
                        ) : message.attachment ? (
                          message.attachment.type.startsWith('image/') ? (
                            <button
                              className="messenger-image"
                              aria-label={`${message.attachment.name} 원본 보기`}
                              onClick={() => setPreview(message.attachment!)}
                            >
                              <img
                                src={message.attachment.url}
                                alt={message.attachment.name}
                                loading="lazy"
                              />
                              <span>{message.attachment.name}</span>
                            </button>
                          ) : (
                            <a
                              className="messenger-file"
                              href={message.attachment.url}
                              download={message.attachment.name}
                              target="_blank"
                              rel="noreferrer"
                            >
                              <FileText size={28} />
                              <span>
                                <strong>{message.attachment.name}</strong>
                                <small>
                                  {(message.attachment.size / 1024 / 1024).toFixed(2)} MB · 파일
                                  열기
                                </small>
                              </span>
                            </a>
                          )
                        ) : (
                          <div className="messenger-text-content">
                            {message.text && looksLikeSchedule(message.text) ? (
                              <ScheduleTextMessage
                                keyword={search}
                                text={message.text}
                                linkedId={
                                  scheduleDocuments.data?.find(
                                    (doc) =>
                                      doc.room_id === roomId &&
                                      doc.source_message_id === message.id,
                                  )?.schedule_id
                                }
                                open={() =>
                                  setScheduleText({ text: message.text!, messageId: message.id })
                                }
                              />
                            ) : (
                              <div className="message-bubble">
                                <HighlightedMessage text={message.text ?? ''} keyword={search} />
                              </div>
                            )}
                          </div>
                        )}
                      </MessageGesture>
                      {(!message.deleted_at || showTime) && (
                        <span className="message-side">
                          {!message.deleted_at && (
                            <button
                              className="chat-message-more"
                              aria-label={message.author + ' 메시지 메뉴'}
                              onClick={() => setActions(message)}
                            >
                              <MoreHorizontal size={15} />
                            </button>
                          )}
                          {showTime && (
                            <time className="message-time" dateTime={message.created_at}>
                              {timeLabel(message.created_at)}
                            </time>
                          )}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Fragment>
            );
          })}
        </div>
        {newMessages && timeline.length > 0 && (
          <button
            className="messenger-new"
            aria-label="새 메시지 보기"
            onClick={() => scrollDown()}
          >
            <strong>{timeline.at(-1)!.author}</strong>
            <span>{messageText(timeline.at(-1)!)}</span>
            <ChevronDown size={18} />
          </button>
        )}
        {scrolledUp && (
          <button
            className="messenger-bottom"
            aria-label="최근 메시지로 이동"
            onClick={() => scrollDown()}
          >
            <ArrowDown size={19} />
          </button>
        )}
      </div>
      {searching && (
        <div className="messenger-search-nav" role="group" aria-label="검색 결과 이동">
          <span aria-live="polite">
            {!search.trim()
              ? '찾을 단어를 입력해 주세요'
              : searchResults.length
                ? `검색 결과 ${searchResults.length}개 중 ${searchIndex + 1}번째`
                : '검색 결과가 없습니다'}
          </span>
          <button
            className="icon-btn"
            aria-label="이전 검색 결과"
            disabled={searchIndex <= 0}
            onClick={() => moveSearch(-1)}
          >
            <ChevronUp size={22} />
          </button>
          <button
            className="icon-btn"
            aria-label="다음 검색 결과"
            disabled={searchIndex < 0 || searchIndex >= searchResults.length - 1}
            onClick={() => moveSearch(1)}
          >
            <ChevronDown size={22} />
          </button>
        </div>
      )}
      {!searching && (send.error || attach.error || fileError) && (
        <div className="messenger-error">
          <ErrorState error={send.error || attach.error || fileError} />
        </div>
      )}
      {!searching && file && (
        <div className="messenger-file-pending">
          <Paperclip size={19} />
          <span>
            <strong>{file.name}</strong>
            <small>
              {(file.size / 1024 / 1024).toFixed(2)} MB · 파일을 보내면 대화에 첨부됩니다.
            </small>
          </span>
          <button
            className="icon-btn"
            disabled={attach.isPending}
            aria-label="첨부 취소"
            onClick={() => setFile(null)}
          >
            <X size={18} />
          </button>
          <button
            className="btn small"
            disabled={busy || !navigator.onLine}
            onClick={() => attach.mutate(replyTo?.id)}
          >
            {attach.isPending ? '보내는 중…' : '파일 보내기'}
          </button>
        </div>
      )}
      {!searching && looksLikeSchedule(text) && (
        <div className="messenger-schedule-detected">
          <CalendarDays size={18} />
          <span>텍스트 근무표를 쉬프트로 정리할 수 있어요.</span>
          <button disabled={busy} onClick={() => setScheduleText({ text })}>
            정리하기
          </button>
        </div>
      )}
      {!searching && replyTo && (
        <div className="chat-reply-draft">
          <div>
            <strong>{replyTo.author}에게 답장</strong>
            <p>{messageText(replyTo).slice(0, 180)}</p>
          </div>
          <button
            className="icon-btn"
            aria-label="답장 취소"
            disabled={busy}
            onClick={() => setReplyTo(null)}
          >
            <X size={18} />
          </button>
        </div>
      )}
      <form
        className="composer messenger-composer"
        hidden={searching}
        data-unsaved={!!text.trim() || !!file || !!replyTo}
        data-pending={busy}
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <button
          type="button"
          className="attach-button"
          aria-label="사진·영수증·근무표 첨부"
          aria-expanded={attachments}
          onClick={() => {
            input.current?.blur();
            setAttachments(!attachments);
            setEmojis(false);
          }}
          disabled={busy}
        >
          {attachments ? <X size={23} /> : <Plus size={25} />}
        </button>
        <div className="messenger-input-wrap">
          <textarea
            ref={input}
            aria-label="메시지"
            placeholder="메시지 입력"
            rows={1}
            value={text}
            maxLength={50000}
            disabled={busy || !!file}
            onChange={(e) => {
              setText(e.target.value);
              send.reset();
            }}
            onKeyDown={(e) => {
              if (
                e.key === 'Enter' &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing &&
                window.matchMedia('(min-width: 761px)').matches
              ) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <button
            type="button"
            className="messenger-emoji-btn"
            aria-label="이모지 선택"
            aria-expanded={emojis}
            disabled={busy || !!file}
            onClick={() => {
              input.current?.blur();
              setEmojis(!emojis);
              setAttachments(false);
            }}
          >
            <Smile size={23} />
          </button>
          <button
            className="send-button"
            aria-label="메시지 전송"
            disabled={!text.trim() || busy || !!file || !navigator.onLine}
          >
            <Send size={20} />
            <span className="send-label">전송</span>
          </button>
        </div>
      </form>
      {emojis && !searching && (
        <div className="messenger-emoji-list" aria-label="이모지">
          {['😊', '👍', '✅', '🙏', '👏', '❤️', '👀', '🍽️', '📦', '☕', '🙌', '🙂'].map((emoji) => (
            <button
              key={emoji}
              aria-label={emoji}
              onClick={() => {
                setText((old) => (old + emoji).slice(0, 50000));
                setEmojis(false);
                input.current?.focus({ preventScroll: true });
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
      {attachments && !searching && (
        <div className="messenger-attachments">
          <button onClick={() => setUpload('RECEIPT')}>
            <span data-tone="receipt">
              <ReceiptText size={24} />
            </span>
            영수증 분석
          </button>
          <button onClick={() => fileInput.current?.click()}>
            <span data-tone="file">
              <Paperclip size={24} />
            </span>
            사진·PDF
          </button>
          <button onClick={() => cameraInput.current?.click()}>
            <span data-tone="camera">
              <Camera size={24} />
            </span>
            사진 촬영
          </button>
          <button
            onClick={() => {
              setAttachments(false);
              setScheduleText({ text: '' });
            }}
          >
            <span data-tone="schedule">
              <CalendarDays size={24} />
            </span>
            근무표 입력
          </button>
        </div>
      )}
      <input
        hidden
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        onChange={(e) => {
          selectFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <input
        hidden
        ref={cameraInput}
        type="file"
        capture="environment"
        accept="image/*"
        onChange={(e) => {
          selectFile(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      {upload && (
        <UploadDialog
          room={roomId}
          initialType={upload}
          close={() => {
            setUpload(null);
            setAttachments(false);
            forceBottom.current = true;
          }}
        />
      )}
      {scheduleText && (
        <ScheduleTextDialog
          text={scheduleText.text}
          messageId={scheduleText.messageId}
          room={roomId}
          close={() => setScheduleText(null)}
        />
      )}
      {preview && (
        <Modal title={preview.name} close={() => setPreview(null)} wide>
          <img className="messenger-preview-image" src={preview.url} alt={preview.name} />
          <a
            className="btn full"
            href={preview.url}
            download={preview.name}
            target="_blank"
            rel="noreferrer"
          >
            원본 파일 열기
          </a>
        </Modal>
      )}
      {actions && (
        <ChatMessageTools
          message={timeline.find((m) => m.id === actions.id) ?? actions}
          roomId={roomId}
          close={() => setActions(null)}
          reply={(message) => {
            setReplyTo(message);
            input.current?.focus({ preventScroll: true });
          }}
        />
      )}
      {menu && (
        <Modal title="채팅방 정보" close={() => setMenu(false)}>
          <div className="messenger-room-info">
            <span className="messenger-room-avatar">
              <MessageCircle size={28} />
            </span>
            <h3>{name}</h3>
            <p>{workspace.name}</p>
          </div>
          <ChatMembers roomId={roomId} />
          <div className="messenger-menu-links">
            <Link to="/receipts">
              <ReceiptText size={19} />
              영수증 보관함
              <ArrowRight size={16} />
            </Link>
            <Link to="/schedules">
              <CalendarDays size={19} />
              근무표·쉬프트
              <ArrowRight size={16} />
            </Link>
            <Link to="/dashboard">
              <ArrowLeft size={19} />
              대시보드로 돌아가기
            </Link>
          </div>
          <p className="muted text-small">
            {isDemo
              ? '데모 메시지는 현재 사업장의 브라우저 저장소에 보관됩니다.'
              : '메시지와 문서 상태는 연결된 서버에서 불러옵니다.'}
          </p>
        </Modal>
      )}
    </section>
  );
}

function ScheduleTextMessage({
  text,
  open,
  linkedId,
  keyword = '',
}: {
  text: string;
  open: () => void;
  linkedId?: string;
  keyword?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <div className="message-bubble">
        <HighlightedMessage
          text={expanded || keyword.trim() || text.length < 500 ? text : `${text.slice(0, 500)}\n…`}
          keyword={keyword}
        />
        {text.length >= 500 && (
          <button className="messenger-text-expand" onClick={() => setExpanded(!expanded)}>
            {expanded ? '원문 접기' : '원문 전체 보기'}
          </button>
        )}
      </div>
      {linkedId ? (
        <ScheduleCard id={linkedId} />
      ) : (
        <button className="messenger-convert-schedule" onClick={open}>
          <CalendarDays size={16} />
          근무표로 정리
          <ArrowRight size={15} />
        </button>
      )}
    </>
  );
}

function ReceiptCard({ id }: { id: string }) {
  const query = useReceipt(id);
  if (query.isPending)
    return (
      <div className="receipt-card">
        <Loading />
      </div>
    );
  if (query.error) return <ErrorState error={query.error} retry={() => query.refetch()} />;
  const r = query.data;
  const waiting = ['UPLOADED', 'PROCESSING'].includes(r.status);
  return (
    <div className="receipt-card">
      <div className="messenger-document-label">
        <ReceiptText size={15} />
        영수증 분석
      </div>
      <div className="receipt-card-head">
        <span className="mini-icon green">
          <ReceiptText size={20} />
        </span>
        <div>
          <strong>{r.supplier.name || r.file_name}</strong>
          <small>
            {r.demo_scenario && r.demo_scenario !== 'manual'
              ? '가상 샘플'
              : isDemo
                ? '직접 입력'
                : r.file_name}
          </small>
        </div>
      </div>
      <Badge status={r.status} />
      {waiting ? (
        <p className="analysis-message">
          {isDemo && r.demo_scenario === 'manual'
            ? '파일을 준비하고 있어요. 원본을 보고 입력해 주세요.'
            : '품목과 금액을 분석하고 있어요.'}
          <span className="loading-dots">···</span>
        </p>
      ) : (
        <>
          <div className="receipt-card-stats">
            <span>
              품목 <strong>{r.items.length}개</strong>
            </span>
            <span>
              금액{' '}
              <strong>
                {r.items.some((i) => i.line_total == null)
                  ? '확인 필요'
                  : won(r.items.reduce((sum, i) => sum + (i.line_total ?? 0), 0))}
              </strong>
            </span>
          </div>
          {r.status === 'NEEDS_REVIEW' && (
            <p className="review-hint">
              {r.items.filter((item) => item.status === 'NEEDS_REVIEW').length}개 품목을 원본과
              비교해 주세요.
            </p>
          )}
          {r.status === 'FAILED' && (
            <p className="review-hint">{r.error || '분석에 실패했습니다. 다시 시도해 주세요.'}</p>
          )}
        </>
      )}
      <Link className="receipt-card-link" to={`/receipts/${id}`}>
        {waiting
          ? '처리 상태 보기'
          : r.status === 'APPROVED'
            ? '확정 내역 보기'
            : '영수증 확인하기'}
        <ArrowRight size={16} />
      </Link>
    </div>
  );
}

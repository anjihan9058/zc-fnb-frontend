import type { Message } from './types';

export interface ChatPerson {
  id: string;
  name: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
}
export interface RoomMembership {
  members: ChatPerson[];
  can_invite: boolean;
  can_remove: boolean;
}
export interface ChatManagementApi {
  members(room: string): Promise<RoomMembership>;
  directory(): Promise<ChatPerson[]>;
  invite(room: string, userIds: string[]): Promise<void>;
  remove(room: string, userId: string): Promise<void>;
}
export interface MessageReply {
  id: string;
  author: string;
  text: string;
}
export const messageText = (message: Message) =>
  message.deleted_at
    ? '삭제된 메시지입니다.'
    : message.text ||
      message.attachment?.name ||
      (message.receipt_id ? '영수증 분석' : message.schedule_id ? '근무표' : '메시지');
export function messageMatches(message: Message, keyword: string) {
  return (
    !message.deleted_at &&
    `${messageText(message)} ${message.author}`
      .toLocaleLowerCase()
      .includes(keyword.trim().toLocaleLowerCase())
  );
}

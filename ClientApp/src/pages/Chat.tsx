import { useState, useEffect } from 'react';
import { MessageSquare, Globe, Lock, Hash } from 'lucide-react';
import { useChat } from '../context/ChatContext';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { ChatSidebar } from '../components/Chat/ChatSidebar';
import { MessageList } from '../components/Chat/MessageList';
import { MessageInput } from '../components/Chat/MessageInput';
import { TypingIndicator } from '../components/Chat/TypingIndicator';
import { ChatMessage } from '../types';

export default function Chat() {
  const { user } = useAuth();
  const { users } = useData();
  const {
    messages,
    roomMessages,
    rooms,
    activeRoomId,
    setActiveRoomId,
    onlineUsers,
    typingUsers,
    isConnected,
    isLoadingHistory,
    hasMoreMessages,
    sendMessage,
    sendFile,
    startTyping,
    markAsRead,
    loadMoreMessages,
    createRoom,
    openDirectMessage,
    loadRoomMessages,
  } = useChat();

  usePushNotifications();

  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);

  useEffect(() => { markAsRead(); }, [markAsRead, messages.length]);

  // Load room messages when switching rooms
  useEffect(() => {
    if (activeRoomId != null && !roomMessages[activeRoomId]) {
      loadRoomMessages(activeRoomId);
    }
  }, [activeRoomId, roomMessages, loadRoomMessages]);

  const handleSelectRoom = (roomId: number | null) => {
    setActiveRoomId(roomId);
    setReplyTo(null);
  };

  const handleOpenDM = async (userId: number) => {
    const room = await openDirectMessage(userId);
    setActiveRoomId(room.id);
    setReplyTo(null);
  };

  const handleCreateRoom = async (name: string, type: 'public' | 'private', memberIds: number[]) => {
    const room = await createRoom(name, type, memberIds);
    setActiveRoomId(room.id);
  };

  if (!user) return null;

  const activeRoom = activeRoomId != null ? rooms.find(r => r.id === activeRoomId) : null;
  const activeMessages = activeRoomId != null ? (roomMessages[activeRoomId] ?? []) : messages;
  const totalMessages = activeRoomId != null ? (roomMessages[activeRoomId]?.length ?? 0) : messages.length;

  const headerIcon = !activeRoom
    ? <Globe size={16} className="text-indigo-400" />
    : activeRoom.roomType === 'private'
    ? <Lock size={16} className="text-amber-400" />
    : activeRoom.roomType === 'direct'
    ? null
    : <Hash size={16} className="text-indigo-400" />;

  const headerTitle = !activeRoom
    ? 'Global'
    : activeRoom.roomType === 'direct'
    ? activeRoom.name
    : activeRoom.name;

  const headerSub = !activeRoom
    ? `${onlineUsers.length} online · ${totalMessages} messages`
    : activeRoom.roomType === 'direct'
    ? (onlineUsers.find(u => activeRoom.members.find(m => m.userId === u.userId && m.userId !== user.id)) ? 'Online' : 'Offline')
    : `${activeRoom.members.length} members · ${totalMessages} messages`;

  const otherDmMember = activeRoom?.roomType === 'direct'
    ? activeRoom.members.find(m => m.userId !== user.id)
    : null;

  return (
    <div className="flex h-[calc(100vh-4rem)] -m-4 lg:-m-6 overflow-hidden">
      <ChatSidebar
        allUsers={users}
        onlineUsers={onlineUsers}
        rooms={rooms}
        activeRoomId={activeRoomId}
        currentUserId={user.id}
        isConnected={isConnected}
        onSelectRoom={handleSelectRoom}
        onOpenDM={handleOpenDM}
        onCreateRoom={handleCreateRoom}
      />

      <div className="flex flex-col flex-1 min-w-0 bg-gray-50 dark:bg-[#0d0d12]">
        {/* Header */}
        <div className="h-14 flex items-center gap-3 px-4 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950 shrink-0">
          <div className="h-9 w-9 rounded-xl bg-indigo-100 dark:bg-indigo-950/40 flex items-center justify-center overflow-hidden shrink-0">
            {otherDmMember?.avatarUrl
              ? <img src={otherDmMember.avatarUrl} alt="" className="h-full w-full object-cover" />
              : otherDmMember
              ? <span className="text-sm font-bold text-indigo-600 uppercase">{otherDmMember.userName.slice(0, 1)}</span>
              : <MessageSquare size={18} className="text-indigo-600 dark:text-indigo-400" />
            }
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              {headerIcon}
              <p className="text-sm font-black uppercase tracking-tight text-gray-800 dark:text-gray-100">{headerTitle}</p>
            </div>
            <p className="text-[11px] text-gray-400">{headerSub}</p>
          </div>
        </div>

        <MessageList
          messages={activeMessages}
          currentUserId={user.id}
          hasMore={hasMoreMessages}
          isLoading={isLoadingHistory}
          onLoadMore={loadMoreMessages}
          onReply={setReplyTo}
        />

        <TypingIndicator names={typingUsers.map(t => t.userName)} />

        <MessageInput
          onSendText={sendMessage}
          onSendFile={sendFile}
          onTyping={startTyping}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
        />
      </div>
    </div>
  );
}

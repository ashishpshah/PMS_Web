import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from 'react';
import * as signalR from '@microsoft/signalr';
import { useLocation } from 'react-router-dom';
import { ChatMessage, OnlineUser, ChatRoom } from '../types';
import { useAuth } from './AuthContext';
import { useData } from './DataContext';
import { apiRequest, getAccessToken, tryRefreshAccessToken } from '../lib/api';

interface TypingUser {
  userId: number;
  userName: string;
}

interface ChatContextType {
  // Global messages (roomId = null)
  messages: ChatMessage[];
  // Room-specific messages keyed by roomId
  roomMessages: Record<number, ChatMessage[]>;
  rooms: ChatRoom[];
  activeRoomId: number | null;
  setActiveRoomId: (id: number | null) => void;
  onlineUsers: OnlineUser[];
  typingUsers: TypingUser[];
  unreadCount: number;
  isConnected: boolean;
  isLoadingHistory: boolean;
  hasMoreMessages: boolean;
  sendMessage: (content: string, replyToId?: number) => Promise<void>;
  sendFile: (file: File, replyToId?: number) => Promise<void>;
  startTyping: () => void;
  stopTyping: () => void;
  markAsRead: () => void;
  loadMoreMessages: () => Promise<void>;
  notifyNewMessage: (title: string, body: string) => void;
  createRoom: (name: string, type: 'public' | 'private', memberIds: number[]) => Promise<ChatRoom>;
  openDirectMessage: (otherUserId: number) => Promise<ChatRoom>;
  loadRoomMessages: (roomId: number) => Promise<void>;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const { user, isLoading: authLoading } = useAuth();
  const { ingestNotification } = useData();
  const location = useLocation();
  const connectionRef = useRef<signalR.HubConnection | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref keeps the connection handler from depending on ingestNotification's identity.
  const ingestRef = useRef(ingestNotification);
  useEffect(() => { ingestRef.current = ingestNotification; }, [ingestNotification]);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [roomMessages, setRoomMessages] = useState<Record<number, ChatMessage[]>>({});
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [activeRoomId, setActiveRoomId] = useState<number | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);

  const activeRoomIdRef = useRef<number | null>(null);
  useEffect(() => { activeRoomIdRef.current = activeRoomId; }, [activeRoomId]);

  // P5-J: useRef guard prevents stale-closure issue with isLoadingHistory state
  const isLoadingHistoryRef = useRef(false);

  const isOnChatPage = location.pathname === '/chat';

  const notifyNewMessage = useCallback((title: string, body: string) => {
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/favicon.ico' });
    }
  }, []);

  const loadHistory = useCallback(async (beforeId?: number, roomId?: number) => {
    if (isLoadingHistoryRef.current) return;
    isLoadingHistoryRef.current = true;
    setIsLoadingHistory(true);
    try {
      const params = new URLSearchParams({ count: '50' });
      if (beforeId) params.set('beforeId', String(beforeId));
      if (roomId != null) params.set('roomId', String(roomId));
      const data = await apiRequest<ChatMessage[]>(`/chat/messages?${params}`);
      if (roomId != null) {
        setRoomMessages(prev => ({
          ...prev,
          [roomId]: beforeId ? [...data, ...(prev[roomId] ?? [])] : data,
        }));
      } else {
        if (beforeId) setMessages(prev => [...data, ...prev]);
        else setMessages(data);
      }
      if (data.length < 50) setHasMoreMessages(false);
    } catch {
      // silent
    } finally {
      isLoadingHistoryRef.current = false;
      setIsLoadingHistory(false);
    }
  // isLoadingHistoryRef is stable (useRef) — no dep needed
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadRooms = useCallback(async () => {
    try {
      const data = await apiRequest<ChatRoom[]>('/chat/rooms');
      setRooms(data);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    // Wait until auth is ready so the in-memory access token exists before connecting.
    if (!user || authLoading) return;

    const connection = new signalR.HubConnectionBuilder()
      .withUrl('/hubs/chat', {
        // Access token lives in memory (api.ts), not localStorage. SignalR calls this on
        // every (re)connect, so we can refresh on demand when the token has expired.
        accessTokenFactory: async () => getAccessToken() ?? (await tryRefreshAccessToken()) ?? '',
        transport: signalR.HttpTransportType.WebSockets | signalR.HttpTransportType.LongPolling,
      })
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    connectionRef.current = connection;

    connection.on('ReceiveMessage', (msg: ChatMessage) => {
      if (msg.roomId != null) {
        setRoomMessages(prev => ({
          ...prev,
          [msg.roomId!]: [...(prev[msg.roomId!] ?? []), msg],
        }));
        // Update last message on room list
        setRooms(prev => prev.map(r =>
          r.id === msg.roomId ? { ...r, lastMessage: msg, unreadCount: activeRoomIdRef.current === msg.roomId ? 0 : r.unreadCount + 1 } : r
        ));
        if (!isOnChatPage || activeRoomIdRef.current !== msg.roomId) {
          if (msg.senderId !== user.id) {
            const preview = msg.messageType === 'file' ? `📎 ${msg.attachment?.fileName ?? 'File'}` : (msg.content?.slice(0, 60) ?? '');
            notifyNewMessage(msg.senderName, preview);
            setUnreadCount(c => c + 1);
          }
        }
      } else {
        setMessages(prev => [...prev, msg]);
        if (!isOnChatPage && msg.senderId !== user.id) {
          setUnreadCount(c => c + 1);
          const preview = msg.messageType === 'file' ? `📎 ${msg.attachment?.fileName ?? 'File'}` : (msg.content?.slice(0, 60) ?? '');
          notifyNewMessage(msg.senderName, preview);
        }
      }
    });

    // In-app notifications (task events, template runs, work diary, …) pushed to this user.
    // Always lands in the bell feed; block/issue/overdue also pop a modal dialog.
    connection.on('ReceiveNotification', (n: { title: string; body: string; type?: string; taskId?: number }) => {
      ingestRef.current({ title: n.title, body: n.body, type: n.type, taskId: n.taskId });
      notifyNewMessage(n.title, n.body);
    });

    connection.on('OnlineUsers', (users: OnlineUser[]) => setOnlineUsers(users));
    connection.on('UserJoined', (userInfo: OnlineUser) => {
      setOnlineUsers(prev => prev.find(u => u.userId === userInfo.userId) ? prev : [...prev, userInfo]);
    });
    connection.on('UserLeft', (userId: number) => {
      setOnlineUsers(prev => prev.filter(u => u.userId !== userId));
    });
    connection.on('TypingStarted', (userId: number, userName: string) => {
      setTypingUsers(prev => prev.find(u => u.userId === userId) ? prev : [...prev, { userId, userName }]);
    });
    connection.on('TypingStopped', (userId: number) => {
      setTypingUsers(prev => prev.filter(u => u.userId !== userId));
    });

    connection.onreconnecting(() => setIsConnected(false));
    connection.onreconnected(() => setIsConnected(true));
    connection.onclose(() => setIsConnected(false));

    let cancelled = false;

    const start = async () => {
      try {
        await connection.start();
        if (!cancelled) {
          setIsConnected(true);
          await Promise.all([loadHistory(), loadRooms()]);
        }
      } catch {
        if (!cancelled) setIsConnected(false);
      }
    };

    start();
    return () => {
      cancelled = true;
      connection.stop();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, authLoading]);

  const loadRoomMessages = useCallback(async (roomId: number) => {
    await loadHistory(undefined, roomId);
  }, [loadHistory]);

  const sendMessage = useCallback(async (content: string, replyToId?: number) => {
    if (!connectionRef.current || connectionRef.current.state !== signalR.HubConnectionState.Connected) return;
    await connectionRef.current.invoke('SendMessage', {
      content,
      messageType: 'text',
      replyToId,
      roomId: activeRoomIdRef.current,
    });
  }, []);

  const sendFile = useCallback(async (file: File, replyToId?: number) => {
    const formData = new FormData();
    formData.append('file', file);
    const token = getAccessToken() ?? (await tryRefreshAccessToken()) ?? '';
    const resp = await fetch('/api/chat/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.message ?? 'Upload failed');
    }
    const attachment = await resp.json();
    if (connectionRef.current?.state === signalR.HubConnectionState.Connected) {
      await connectionRef.current.invoke('SendMessage', {
        content: file.name,
        messageType: 'file',
        replyToId,
        attachmentId: attachment.id,
        roomId: activeRoomIdRef.current,
      });
    }
  }, []);

  const startTyping = useCallback(() => {
    if (connectionRef.current?.state !== signalR.HubConnectionState.Connected) return;
    connectionRef.current.invoke('StartTyping', activeRoomIdRef.current).catch(() => {});
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      connectionRef.current?.invoke('StopTyping', activeRoomIdRef.current).catch(() => {});
    }, 2500);
  }, []);

  const stopTyping = useCallback(() => {
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    connectionRef.current?.invoke('StopTyping', activeRoomIdRef.current).catch(() => {});
  }, []);

  const markAsRead = useCallback(() => setUnreadCount(0), []);

  const loadMoreMessages = useCallback(async () => {
    if (!hasMoreMessages) return;
    if (activeRoomIdRef.current != null) {
      const roomMsgs = roomMessages[activeRoomIdRef.current] ?? [];
      if (roomMsgs.length) await loadHistory(roomMsgs[0].id, activeRoomIdRef.current);
    } else {
      if (messages.length) await loadHistory(messages[0].id);
    }
  }, [messages, roomMessages, hasMoreMessages, loadHistory]);

  const createRoom = useCallback(async (name: string, type: 'public' | 'private', memberIds: number[]): Promise<ChatRoom> => {
    const room = await apiRequest<ChatRoom>('/chat/rooms', {
      method: 'POST',
      body: JSON.stringify({ name, roomType: type, memberIds }),
    });
    setRooms(prev => [room, ...prev]);
    if (connectionRef.current?.state === signalR.HubConnectionState.Connected) {
      await connectionRef.current.invoke('JoinRoom', room.id);
    }
    return room;
  }, []);

  const openDirectMessage = useCallback(async (otherUserId: number): Promise<ChatRoom> => {
    const room = await apiRequest<ChatRoom>(`/chat/rooms/direct/${otherUserId}`, { method: 'POST' });
    setRooms(prev => {
      if (prev.find(r => r.id === room.id)) return prev;
      return [room, ...prev];
    });
    if (connectionRef.current?.state === signalR.HubConnectionState.Connected) {
      await connectionRef.current.invoke('JoinRoom', room.id);
    }
    return room;
  }, []);

  return (
    <ChatContext.Provider value={{
      messages,
      roomMessages,
      rooms,
      activeRoomId,
      setActiveRoomId,
      onlineUsers,
      typingUsers,
      unreadCount,
      isConnected,
      isLoadingHistory,
      hasMoreMessages,
      sendMessage,
      sendFile,
      startTyping,
      stopTyping,
      markAsRead,
      loadMoreMessages,
      notifyNewMessage,
      createRoom,
      openDirectMessage,
      loadRoomMessages,
    }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error('useChat must be used within ChatProvider');
  return ctx;
}

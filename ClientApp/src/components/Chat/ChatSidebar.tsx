import { useState } from 'react';
import { Users, ChevronLeft, ChevronRight, Wifi, WifiOff, Plus, Globe, Lock, MessageCircle, Hash, X, Check } from 'lucide-react';
import { OnlineUser, User, ChatRoom } from '../../types';
import { cn } from '../../lib/utils';

interface Props {
  allUsers: User[];
  onlineUsers: OnlineUser[];
  rooms: ChatRoom[];
  activeRoomId: number | null;
  currentUserId: number;
  isConnected: boolean;
  onSelectRoom: (roomId: number | null) => void;
  onOpenDM: (userId: number) => void;
  onCreateRoom: (name: string, type: 'public' | 'private', memberIds: number[]) => void;
}

type Tab = 'channels' | 'direct';

function Avatar({ name, avatar, size = 8 }: { name: string; avatar?: string | null; size?: number }) {
  const px = `h-${size} w-${size}`;
  if (avatar) return <img src={avatar} alt="" className={`${px} rounded-full object-cover`} />;
  return (
    <div className={`${px} rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-[11px] font-bold text-indigo-600 dark:text-indigo-400 uppercase`}>
      {name.slice(0, 1)}
    </div>
  );
}

function OnlineDot({ online }: { online: boolean }) {
  return <span className={cn('absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-gray-950', online ? 'bg-green-400' : 'bg-gray-300 dark:bg-gray-600')} />;
}

function NewRoomModal({ allUsers, currentUserId, onClose, onCreate }: {
  allUsers: User[];
  currentUserId: number;
  onClose: () => void;
  onCreate: (name: string, type: 'public' | 'private', memberIds: number[]) => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<'public' | 'private'>('public');
  const [selected, setSelected] = useState<number[]>([]);

  const toggle = (id: number) => setSelected(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-80 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-widest text-gray-700 dark:text-gray-200">New Channel</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
        </div>

        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Channel name"
          className="w-full px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-400/40"
        />

        <div className="flex gap-2">
          {(['public', 'private'] as const).map(t => (
            <button
              key={t}
              onClick={() => setType(t)}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-widest border transition-colors',
                type === t
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800'
              )}
            >
              {t === 'public' ? <Globe size={11} /> : <Lock size={11} />} {t}
            </button>
          ))}
        </div>

        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-2">Add Members</p>
          <div className="max-h-40 overflow-y-auto space-y-1 custom-scrollbar">
            {allUsers.filter(u => u.id !== currentUserId).map(u => (
              <button
                key={u.id}
                onClick={() => toggle(u.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <Avatar name={u.name} avatar={u.avatar} size={6} />
                <span className="flex-1 text-left text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{u.name}</span>
                {selected.includes(u.id) && <Check size={13} className="text-indigo-500 shrink-0" />}
              </button>
            ))}
          </div>
        </div>

        <button
          disabled={!name.trim()}
          onClick={() => { onCreate(name.trim(), type, selected); onClose(); }}
          className="w-full py-2 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Create Channel
        </button>
      </div>
    </div>
  );
}

export function ChatSidebar({ allUsers, onlineUsers, rooms, activeRoomId, currentUserId, isConnected, onSelectRoom, onOpenDM, onCreateRoom }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState<Tab>('channels');
  const [showNewRoom, setShowNewRoom] = useState(false);

  const onlineIds = new Set(onlineUsers.map(u => u.userId));

  // Channels = public + private rooms
  const channels = rooms.filter(r => r.roomType !== 'direct');
  // DMs = direct rooms
  const dms = rooms.filter(r => r.roomType === 'direct');

  // Sort all users: current first, then most recent message sender, then alpha
  const sortedUsers = [...allUsers].sort((a, b) => {
    if (a.id === currentUserId) return -1;
    if (b.id === currentUserId) return 1;
    const dmA = dms.find(r => r.members.some(m => m.userId === a.id));
    const dmB = dms.find(r => r.members.some(m => m.userId === b.id));
    const tA = dmA?.lastMessage ? new Date(dmA.lastMessage.sentAt).getTime() : 0;
    const tB = dmB?.lastMessage ? new Date(dmB.lastMessage.sentAt).getTime() : 0;
    if (tB !== tA) return tB - tA;
    return a.name.localeCompare(b.name);
  });

  const channelIcon = (type: string) =>
    type === 'private' ? <Lock size={11} className="text-gray-400 shrink-0" /> : <Hash size={11} className="text-gray-400 shrink-0" />;

  return (
    <>
      <div className={cn(
        'flex flex-col border-r border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950 transition-all duration-300 shrink-0',
        collapsed ? 'w-12' : 'w-60'
      )}>
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-3 border-b border-gray-100 dark:border-gray-800">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <MessageCircle size={15} className="text-indigo-500" />
              <span className="text-xs font-black uppercase tracking-widest text-gray-600 dark:text-gray-300">Chat</span>
            </div>
          )}
          <button
            onClick={() => setCollapsed(c => !c)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors ml-auto"
          >
            {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        {!collapsed && (
          <>
            {/* Connection status */}
            <div className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold border-b border-gray-50 dark:border-gray-900',
              isConnected ? 'text-green-600 dark:text-green-400' : 'text-gray-400'
            )}>
              {isConnected ? <><Wifi size={11} /> Connected · {onlineUsers.length} online</> : <><WifiOff size={11} /> Reconnecting…</>}
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-100 dark:border-gray-800">
              {(['channels', 'direct'] as Tab[]).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    'flex-1 py-2 text-[10px] font-black uppercase tracking-widest transition-colors',
                    tab === t
                      ? 'text-indigo-600 border-b-2 border-indigo-500'
                      : 'text-gray-400 hover:text-gray-600'
                  )}
                >
                  {t === 'channels' ? 'Channels' : 'Direct'}
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto py-2 px-1.5 space-y-0.5 custom-scrollbar">
              {tab === 'channels' && (
                <>
                  {/* Global channel */}
                  <button
                    onClick={() => onSelectRoom(null)}
                    className={cn(
                      'w-full flex items-center gap-2 px-2 py-1.5 rounded-xl text-left transition-colors',
                      activeRoomId === null ? 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300' : 'hover:bg-gray-50 dark:hover:bg-gray-900/50 text-gray-700 dark:text-gray-300'
                    )}
                  >
                    <Globe size={13} className="text-indigo-400 shrink-0" />
                    <span className="text-xs font-semibold truncate">Global</span>
                  </button>

                  {/* Room channels */}
                  {channels.map(r => (
                    <button
                      key={r.id}
                      onClick={() => onSelectRoom(r.id)}
                      className={cn(
                        'w-full flex items-center gap-2 px-2 py-1.5 rounded-xl text-left transition-colors',
                        activeRoomId === r.id ? 'bg-indigo-50 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300' : 'hover:bg-gray-50 dark:hover:bg-gray-900/50 text-gray-700 dark:text-gray-300'
                      )}
                    >
                      {channelIcon(r.roomType)}
                      <span className="text-xs font-semibold truncate flex-1">{r.name}</span>
                      {r.unreadCount > 0 && (
                        <span className="h-4 min-w-[16px] px-1 bg-indigo-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">{r.unreadCount}</span>
                      )}
                    </button>
                  ))}

                  {/* Create channel */}
                  <button
                    onClick={() => setShowNewRoom(true)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-xl text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 transition-colors"
                  >
                    <Plus size={13} />
                    <span className="text-[11px] font-semibold">New Channel</span>
                  </button>
                </>
              )}

              {tab === 'direct' && (
                <>
                  {sortedUsers.map(u => {
                    const isOnline = onlineIds.has(u.id);
                    const dm = dms.find(r => r.members.some(m => m.userId === u.id));
                    const isActive = dm ? activeRoomId === dm.id : false;
                    const isMe = u.id === currentUserId;
                    return (
                      <button
                        key={u.id}
                        onClick={() => !isMe && onOpenDM(u.id)}
                        disabled={isMe}
                        className={cn(
                          'w-full flex items-center gap-2 px-2 py-1.5 rounded-xl text-left transition-colors',
                          isMe ? 'opacity-60 cursor-default' : '',
                          isActive ? 'bg-indigo-50 dark:bg-indigo-950/30' : (!isMe ? 'hover:bg-gray-50 dark:hover:bg-gray-900/50' : '')
                        )}
                      >
                        <div className="relative shrink-0">
                          <Avatar name={u.name} avatar={u.avatar} size={7} />
                          <OnlineDot online={isOnline} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-gray-700 dark:text-gray-200 truncate leading-tight">
                            {u.name}{isMe && <span className="text-[10px] text-indigo-400 ml-1">(you)</span>}
                          </p>
                          {dm?.lastMessage && (
                            <p className="text-[10px] text-gray-400 truncate leading-tight">
                              {dm.lastMessage.content ?? '📎 File'}
                            </p>
                          )}
                        </div>
                        {dm && dm.unreadCount > 0 && (
                          <span className="h-4 min-w-[16px] px-1 bg-indigo-500 text-white text-[9px] font-black rounded-full flex items-center justify-center shrink-0">{dm.unreadCount}</span>
                        )}
                      </button>
                    );
                  })}
                </>
              )}
            </div>

            {/* Members count footer */}
            <div className="px-3 py-2 border-t border-gray-50 dark:border-gray-900 flex items-center gap-1.5">
              <Users size={11} className="text-gray-400" />
              <span className="text-[10px] text-gray-400">{allUsers.length} members</span>
            </div>
          </>
        )}

        {/* Collapsed: show avatar dots */}
        {collapsed && (
          <div className="flex-1 overflow-y-auto py-2 space-y-1.5 px-1.5">
            {allUsers.slice(0, 10).map(u => (
              <div key={u.id} className="relative mx-auto w-fit">
                <Avatar name={u.name} avatar={u.avatar} size={7} />
                <OnlineDot online={onlineIds.has(u.id)} />
              </div>
            ))}
          </div>
        )}
      </div>

      {showNewRoom && (
        <NewRoomModal
          allUsers={allUsers}
          currentUserId={currentUserId}
          onClose={() => setShowNewRoom(false)}
          onCreate={onCreateRoom}
        />
      )}
    </>
  );
}

import { useState, useRef, useCallback, KeyboardEvent, DragEvent } from 'react';
import { Paperclip, Send, X, Image, FileText, Film } from 'lucide-react';
import { ChatMessage } from '../../types';
import { cn } from '../../lib/utils';

interface Props {
  onSendText: (content: string, replyToId?: number) => Promise<void>;
  onSendFile: (file: File, replyToId?: number) => Promise<void>;
  onTyping: () => void;
  replyTo: ChatMessage | null;
  onCancelReply: () => void;
}

function FileChip({ file, onRemove }: { file: File; onRemove: () => void }) {
  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');
  const previewUrl = isImage ? URL.createObjectURL(file) : null;

  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-xl text-sm">
      {isImage && previewUrl ? (
        <img src={previewUrl} alt="" className="h-8 w-8 rounded-lg object-cover" />
      ) : isVideo ? (
        <Film size={18} className="text-indigo-500 shrink-0" />
      ) : (
        <FileText size={18} className="text-indigo-500 shrink-0" />
      )}
      <span className="text-indigo-700 dark:text-indigo-300 font-medium max-w-[140px] truncate text-xs">
        {file.name}
      </span>
      <button
        onClick={onRemove}
        className="text-indigo-400 hover:text-red-500 transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  );
}

export function MessageInput({ onSendText, onSendFile, onTyping, replyTo, onCancelReply }: Props) {
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSend = useCallback(async () => {
    if (sending) return;
    if (!text.trim() && !file) return;

    setSending(true);
    try {
      if (file) {
        await onSendFile(file, replyTo?.id);
        setFile(null);
      }
      if (text.trim()) {
        await onSendText(text.trim(), replyTo?.id);
        setText('');
      }
      if (replyTo) onCancelReply();
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } finally {
      setSending(false);
    }
  }, [sending, text, file, replyTo, onSendText, onSendFile, onCancelReply]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextChange = (val: string) => {
    setText(val);
    onTyping();
    // Auto-resize
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 160)}px`;
    }
  };

  const handleFileSelect = (selected: File | null) => {
    if (!selected) return;
    const ext = '.' + selected.name.split('.').pop()?.toLowerCase();
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.mov', '.webm',
      '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.zip', '.rar', '.7z', '.txt', '.csv'];
    if (!allowed.includes(ext)) {
      alert(`File type "${ext}" is not supported.`);
      return;
    }
    if (selected.size > 20 * 1024 * 1024) {
      alert('File must be under 20 MB.');
      return;
    }
    setFile(selected);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFileSelect(dropped);
  };

  return (
    <div
      className={cn(
        'border-t border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-950 transition-colors',
        isDragging && 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-300 dark:border-indigo-700'
      )}
      onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
          <div className="bg-indigo-100 dark:bg-indigo-950/50 border-2 border-dashed border-indigo-400 rounded-2xl px-8 py-6 text-indigo-600 dark:text-indigo-400 font-semibold text-sm">
            Drop file to send
          </div>
        </div>
      )}

      {/* Reply banner */}
      {replyTo && (
        <div className="flex items-center gap-2 px-4 pt-3 pb-1">
          <div className="flex-1 px-3 py-2 bg-indigo-50 dark:bg-indigo-950/30 border-l-4 border-indigo-500 rounded-r-xl text-xs">
            <span className="font-semibold text-indigo-700 dark:text-indigo-400 block">
              Replying to {replyTo.senderName}
            </span>
            <span className="text-gray-500 truncate block max-w-xs">
              {replyTo.messageType === 'file'
                ? `📎 ${replyTo.attachment?.fileName ?? 'File'}`
                : replyTo.content}
            </span>
          </div>
          <button onClick={onCancelReply} className="text-gray-400 hover:text-red-500 transition-colors p-1">
            <X size={16} />
          </button>
        </div>
      )}

      {/* File preview chip */}
      {file && (
        <div className="px-4 pt-3 pb-1">
          <FileChip file={file} onRemove={() => setFile(null)} />
        </div>
      )}

      <div className="flex items-end gap-2 px-4 py-3">
        {/* Paperclip */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="p-2 rounded-xl text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors shrink-0"
          title="Attach file"
        >
          <Paperclip size={20} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.txt,.csv"
          onChange={e => handleFileSelect(e.target.files?.[0] ?? null)}
        />

        {/* Textarea */}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => handleTextChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
          rows={1}
          className="flex-1 resize-none bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl px-4 py-2.5 text-sm text-gray-800 dark:text-gray-100 placeholder-gray-400 outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400 transition-all custom-scrollbar"
          style={{ minHeight: '42px', maxHeight: '160px' }}
        />

        {/* Send */}
        <button
          type="button"
          onClick={handleSend}
          disabled={sending || (!text.trim() && !file)}
          className="p-2.5 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
          title="Send"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}

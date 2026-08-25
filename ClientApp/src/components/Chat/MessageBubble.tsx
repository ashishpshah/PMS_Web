import { useState } from 'react';
import { Download, FileText, Film, Reply } from 'lucide-react';
import { format } from 'date-fns';
import { ChatMessage, ChatAttachmentData } from '../../types';
import { FilePreviewModal } from './FilePreviewModal';
import { cn } from '../../lib/utils';

interface Props {
  message: ChatMessage;
  isOwn: boolean;
  onReply?: (message: ChatMessage) => void;
}

function linkify(text: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = text.split(urlRegex);
  return parts.map((part, i) =>
    urlRegex.test(part) ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:opacity-80"
      >
        {part}
      </a>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function AttachmentPreview({ attachment, onPreview }: { attachment: ChatAttachmentData; onPreview: () => void }) {
  if (attachment.fileType === 'image') {
    return (
      <img
        src={attachment.url}
        alt={attachment.fileName}
        className="max-w-xs max-h-60 rounded-xl cursor-pointer hover:opacity-90 transition-opacity object-cover"
        onClick={onPreview}
      />
    );
  }

  if (attachment.fileType === 'video') {
    return (
      <div className="relative cursor-pointer" onClick={onPreview}>
        <video
          src={attachment.url}
          className="max-w-xs max-h-48 rounded-xl"
          muted
        />
        <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-xl">
          <Film size={36} className="text-white" />
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-black/10 dark:bg-white/10 cursor-pointer hover:bg-black/15 dark:hover:bg-white/15 transition-colors max-w-xs"
      onClick={onPreview}
    >
      <div className="h-10 w-10 rounded-lg bg-white/20 flex items-center justify-center shrink-0">
        <FileText size={20} className="text-current" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{attachment.fileName}</p>
        <p className="text-xs opacity-70">{formatSize(attachment.fileSize)}</p>
      </div>
      <Download size={16} className="shrink-0 opacity-70" />
    </div>
  );
}

export function MessageBubble({ message, isOwn, onReply }: Props) {
  const [previewAttachment, setPreviewAttachment] = useState<ChatAttachmentData | null>(null);

  const time = format(new Date(message.sentAt), 'HH:mm');
  const avatar = message.senderAvatar
    ? <img src={message.senderAvatar} alt="" className="h-7 w-7 rounded-full object-cover" />
    : (
      <div className="h-7 w-7 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-[11px] font-bold text-indigo-600 dark:text-indigo-400 uppercase">
        {message.senderName.slice(0, 1)}
      </div>
    );

  return (
    <>
      <div className={cn('group flex items-end gap-2 px-4 py-1', isOwn ? 'flex-row-reverse' : 'flex-row')}>
        {!isOwn && (
          <div className="shrink-0 mb-1">{avatar}</div>
        )}

        <div className={cn('flex flex-col max-w-[70%]', isOwn ? 'items-end' : 'items-start')}>
          {!isOwn && (
            <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1 px-1">
              {message.senderName}
            </span>
          )}

          {/* Reply preview */}
          {message.replyTo && (
            <div className={cn(
              'text-xs px-2.5 py-1.5 rounded-lg mb-1 border-l-2 opacity-80 max-w-full',
              isOwn
                ? 'bg-indigo-400/20 border-indigo-300 text-indigo-100'
                : 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400'
            )}>
              <span className="font-semibold block">{message.replyTo.senderName}</span>
              <span className="truncate block max-w-xs">
                {message.replyTo.messageType === 'file'
                  ? `📎 ${message.replyTo.attachment?.fileName ?? 'File'}`
                  : message.replyTo.content}
              </span>
            </div>
          )}

          <div
            className={cn(
              'px-3.5 py-2.5 rounded-2xl text-sm relative',
              isOwn
                ? 'bg-indigo-600 text-white rounded-br-sm'
                : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 border border-gray-100 dark:border-gray-700 rounded-bl-sm shadow-sm'
            )}
          >
            {message.messageType === 'file' && message.attachment ? (
              <AttachmentPreview
                attachment={message.attachment}
                onPreview={() => setPreviewAttachment(message.attachment!)}
              />
            ) : (
              <p className="whitespace-pre-wrap break-words leading-relaxed">
                {linkify(message.content ?? '')}
              </p>
            )}

            <span className={cn(
              'text-[10px] mt-1 block select-none',
              isOwn ? 'text-indigo-200 text-right' : 'text-gray-400 text-right'
            )}>
              {time}
            </span>
          </div>
        </div>

        {/* Reply button on hover */}
        {onReply && (
          <button
            onClick={() => onReply(message)}
            className="opacity-0 group-hover:opacity-100 p-1.5 rounded-full text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-all mb-2"
            title="Reply"
          >
            <Reply size={14} />
          </button>
        )}
      </div>

      {previewAttachment && (
        <FilePreviewModal
          attachment={previewAttachment}
          onClose={() => setPreviewAttachment(null)}
        />
      )}
    </>
  );
}

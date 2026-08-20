import React, { useRef, useState } from 'react';
import { Upload, Trash2, FileIcon, ImageIcon, Link, Plus, X } from 'lucide-react';
import { Attachment } from '../../types';
import { taskService } from '../../services/task.service';
import { showError } from '../../lib/toast';

interface TaskAttachmentsPanelProps {
  taskId?: number;
  attachments: Attachment[];
  onChange: (updated: Attachment[]) => void;
  disabled?: boolean;
}

export function TaskAttachmentsPanel({ taskId, attachments, onChange, disabled }: TaskAttachmentsPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [linkLabel, setLinkLabel] = useState('');
  const [linkUrl, setLinkUrl] = useState('');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = '';

    if (!taskId) {
      showError('Save the task first before uploading files.');
      return;
    }

    setUploading(true);
    try {
      const saved = await taskService.uploadAttachment(taskId, file);
      onChange([...attachments, saved]);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async (id: number) => {
    const attachment = attachments.find(a => a.id === id);
    if (!attachment) return;

    // Link-only attachments (taskId absent on the object) — just remove locally
    if (!attachment.taskId) {
      onChange(attachments.filter(a => a.id !== id));
      return;
    }

    try {
      await taskService.deleteAttachment(attachment.taskId, id);
      onChange(attachments.filter(a => a.id !== id));
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to delete attachment');
    }
  };

  const addLink = () => {
    const url = linkUrl.trim();
    if (!url) return;
    const newAttachment: Attachment = {
      id: Date.now(),
      name: linkLabel.trim() || url,
      url,
      type: 'document',
      size: '—',
    };
    onChange([...attachments, newAttachment]);
    setLinkLabel('');
    setLinkUrl('');
  };

  return (
    <div className="space-y-3">
      <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400 mb-1">Attachments</label>

      {/* File drop zone */}
      <div
        onClick={() => !disabled && !uploading && fileInputRef.current?.click()}
        className={`border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-xl p-5 flex flex-col items-center justify-center transition-all group ${
          disabled || uploading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:border-indigo-500 hover:bg-gray-50 dark:hover:bg-gray-900'
        }`}
      >
        {uploading ? (
          <p className="text-sm text-indigo-500 font-medium animate-pulse">Uploading…</p>
        ) : (
          <>
            <Upload className="h-7 w-7 text-gray-400 group-hover:text-indigo-500 mb-1.5" />
            <p className="text-sm text-gray-500 font-medium">Click to upload a file</p>
            <p className="text-xs text-gray-400 mt-0.5">Images, PDF, Office, ZIP (max 10 MB)</p>
            {!taskId && (
              <p className="text-[10px] text-amber-500 mt-1 font-medium">Save the task first to enable file upload</p>
            )}
          </>
        )}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.7z,.txt,.csv,.json,.xml"
          disabled={disabled || uploading}
        />
      </div>

      {/* Attachment list */}
      {attachments.length > 0 && (
        <div className="space-y-1.5">
          {attachments.map(file => (
            <div
              key={file.id}
              className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-lg group"
            >
              <div className="h-8 w-8 flex-shrink-0 bg-white dark:bg-gray-800 rounded flex items-center justify-center border border-gray-100 dark:border-gray-700 overflow-hidden">
                {file.type === 'image' ? (
                  <ImageIcon className="h-4 w-4 text-indigo-400" />
                ) : file.url.startsWith('http') && !file.taskId ? (
                  <Link className="h-4 w-4 text-blue-400" />
                ) : (
                  <FileIcon className="h-4 w-4 text-indigo-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <a
                  href={file.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-xs font-bold text-gray-900 dark:text-gray-100 truncate hover:text-indigo-600 hover:underline"
                >
                  {file.name}
                </a>
                {file.uploadedByName ? (
                  <p className="text-[10px] text-gray-400">{file.size} · {file.uploadedByName}</p>
                ) : (
                  <p className="text-[10px] text-gray-400 uppercase font-medium">{file.size} · {file.type}</p>
                )}
              </div>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => handleRemove(file.id)}
                  className="p-1 text-gray-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Link attachment section */}
      {!disabled && (
        <div className="space-y-2 pt-1 border-t border-gray-100 dark:border-gray-800">
          <p className="text-[11px] font-black uppercase tracking-widest text-gray-400">Attachment Links</p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={linkLabel}
              onChange={e => setLinkLabel(e.target.value)}
              placeholder="Label"
              className="w-28 shrink-0 px-3 py-1.5 text-[12px] bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-gray-400"
            />
            <input
              type="url"
              value={linkUrl}
              onChange={e => setLinkUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addLink()}
              placeholder="https://…"
              className="flex-1 px-3 py-1.5 text-[12px] bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500 placeholder:text-gray-400"
            />
            <button
              type="button"
              disabled={!linkUrl.trim()}
              onClick={addLink}
              className="shrink-0 p-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

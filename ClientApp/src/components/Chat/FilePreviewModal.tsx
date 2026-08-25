import { useEffect } from 'react';
import { X, Download, FileText, Film } from 'lucide-react';
import { ChatAttachmentData } from '../../types';

interface Props {
  attachment: ChatAttachmentData;
  onClose: () => void;
}

export function FilePreviewModal({ attachment, onClose }: Props) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleDownload = () => {
    const link = document.createElement('a');
    link.href = attachment.url;
    link.download = attachment.fileName;
    link.click();
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative max-w-4xl max-h-[90vh] w-full mx-4 bg-white dark:bg-gray-900 rounded-2xl overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200 truncate max-w-xs">
            {attachment.fileName}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="p-2 rounded-lg text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-colors"
              title="Download"
            >
              <Download size={18} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex items-center justify-center p-4 max-h-[80vh] overflow-auto">
          {attachment.fileType === 'image' ? (
            <img
              src={attachment.url}
              alt={attachment.fileName}
              className="max-w-full max-h-[70vh] rounded-lg object-contain"
            />
          ) : attachment.fileType === 'video' ? (
            <video
              src={attachment.url}
              controls
              className="max-w-full max-h-[70vh] rounded-lg"
            >
              <Film size={48} className="text-gray-400" />
            </video>
          ) : (
            <div className="flex flex-col items-center gap-4 py-12">
              <div className="h-24 w-24 rounded-2xl bg-indigo-50 dark:bg-indigo-950/30 flex items-center justify-center">
                <FileText size={48} className="text-indigo-500" />
              </div>
              <p className="text-lg font-semibold text-gray-700 dark:text-gray-200">{attachment.fileName}</p>
              <p className="text-sm text-gray-400">{(attachment.fileSize / 1024).toFixed(1)} KB</p>
              <button
                onClick={handleDownload}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl flex items-center gap-2 transition-colors"
              >
                <Download size={16} />
                Download File
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

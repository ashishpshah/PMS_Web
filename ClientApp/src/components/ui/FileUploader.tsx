import React, { useRef, useState } from 'react';
import { Upload, X, FileIcon, ImageIcon, Trash2 } from 'lucide-react';
import { Attachment } from '../../types';
import { Button } from './Button';

interface FileUploaderProps {
  attachments: Attachment[];
  onAdd: (file: Attachment) => void;
  onRemove: (id: number) => void;
  label?: string;
  maxSizeMB?: number;
}

export function FileUploader({ attachments, onAdd, onRemove, label = "Attachments", maxSizeMB = 5 }: FileUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    setError(null);

    // Validation
    if (file.size > maxSizeMB * 1024 * 1024) {
      setError(`File size exceeds ${maxSizeMB}MB limit.`);
      return;
    }

    const type = file.type.startsWith('image/') ? 'image' : 'document';
    
    // In a real app, you'd upload to a server/storage here.
    // For this demo, we'll create a local URL.
    const reader = new FileReader();
    reader.onload = (event) => {
      const newAttachment: Attachment = {
        id: Date.now(),
        name: file.name,
        url: event.target?.result as string,
        type: type as 'image' | 'document',
        size: (file.size / 1024).toFixed(1) + ' KB',
      };
      onAdd(newAttachment);
    };
    reader.readAsDataURL(file);

    // Clean up input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-3">
      <label className="block text-[11px] font-black uppercase tracking-widest text-gray-400 mb-1">{label}</label>
      
      <div 
        onClick={() => fileInputRef.current?.click()}
        className="border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer hover:border-indigo-500 hover:bg-gray-50 dark:hover:bg-gray-900 transition-all group"
      >
        <Upload className="h-8 w-8 text-gray-400 group-hover:text-indigo-500 mb-2" />
        <p className="text-sm text-gray-500 font-medium">Click or drag file to upload</p>
        <p className="text-xs text-gray-400 mt-1">Images or Documents (Max {maxSizeMB}MB)</p>
        <input 
          type="file" 
          ref={fileInputRef} 
          onChange={handleFileChange} 
          className="hidden" 
          accept="image/*,.pdf,.doc,.docx,.txt"
        />
      </div>

      {error && (
        <p className="text-xs text-red-500 font-medium">{error}</p>
      )}

      {attachments.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {attachments.map((file) => (
            <div key={file.id} className="flex items-center p-2 bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-lg group">
              <div className="h-10 w-10 flex-shrink-0 bg-white dark:bg-gray-800 rounded flex items-center justify-center mr-3 border border-gray-100 dark:border-gray-700 overflow-hidden">
                {file.type === 'image' ? (
                  <img src={file.url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <FileIcon className="h-5 w-5 text-indigo-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-gray-900 dark:text-gray-100 truncate">{file.name}</p>
                <p className="text-[10px] text-gray-400 uppercase font-medium">{file.size} • {file.type}</p>
              </div>
              <button 
                type="button"
                onClick={() => onRemove(file.id)}
                className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

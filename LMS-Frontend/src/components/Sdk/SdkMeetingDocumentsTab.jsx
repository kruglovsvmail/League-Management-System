import React, { useState, useEffect, useRef } from 'react';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Loader } from '../../ui/Loader';
import { Icon } from '../../ui/Icon';
import { ConfirmModal } from '../../modals/ConfirmModal';
import { getToken, getImageUrl } from '../../utils/helpers';

export function SdkMeetingDocumentsTab({ meetingId, canManage, setToast }) {
  const [documents, setDocuments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState(null);
  const [docTitle, setDocTitle] = useState('');
  const [deleteId, setDeleteId] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const fileInputRef = useRef(null);

  const SERVER_URL = `${import.meta.env.VITE_API_URL}`;

  const fetchDocuments = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/sdk/meetings/${meetingId}/documents`, { headers: { 'Authorization': `Bearer ${getToken()}` } });
      const data = await res.json();
      if (data.success) setDocuments(data.data);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchDocuments(); }, [meetingId]);

  const handleFileSelected = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    setDocTitle(file.name.replace(/\.[^/.]+$/, ''));
  };

  const cancelUpload = () => {
    setPendingFile(null);
    setDocTitle('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleUploadConfirm = async () => {
    if (!pendingFile || !docTitle.trim()) return;

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('files', pendingFile);
      formData.append('title', docTitle.trim());

      const res = await fetch(`${SERVER_URL}/api/sdk/meetings/${meetingId}/documents`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}` },
        body: formData
      });
      const data = await res.json();
      if (data.success) {
        fetchDocuments();
        cancelUpload();
      } else {
        setToast({ title: 'Ошибка', message: data.error, type: 'error' });
      }
    } catch (err) {
      setToast({ title: 'Ошибка', message: 'Сбой загрузки файла', type: 'error' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteId) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`${SERVER_URL}/api/sdk/meeting-documents/${deleteId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${getToken()}` }
      });
      const data = await res.json();
      if (data.success) fetchDocuments();
      else setToast({ title: 'Ошибка', message: data.error, type: 'error' });
    } catch (err) {
      setToast({ title: 'Ошибка', message: 'Сбой удаления', type: 'error' });
    } finally {
      setIsDeleting(false);
      setDeleteId(null);
    }
  };

  if (isLoading) return <div className="p-10 flex justify-center"><Loader /></div>;

  return (
    <div className="bg-white/70 backdrop-blur-[12px] border-[1px] border-white/40 rounded-lg p-6 shadow-sm w-full min-h-[300px]">
      {canManage && (
        <div className="mb-6 pb-6 border-b border-graphite/10 flex flex-col gap-4">
          <input ref={fileInputRef} type="file" onChange={handleFileSelected} className="hidden" />

          {pendingFile ? (
            <div className="flex flex-col gap-3 p-4 bg-white/40 border border-graphite/10 rounded-md animate-zoom-in">
              <span className="text-[12px] text-graphite-light">Файл: <span className="font-bold text-graphite">{pendingFile.name}</span></span>
              <Input label="Название документа" placeholder="Например: Протокол заседания №5" value={docTitle} onChange={e => setDocTitle(e.target.value)} />
              <div className="flex gap-3 justify-end">
                <Button onClick={cancelUpload} disabled={isUploading} className="bg-white border-graphite/20 text-graphite hover:border-graphite">Отмена</Button>
                <Button onClick={handleUploadConfirm} isLoading={isUploading} disabled={!docTitle.trim()} className="min-w-[220px]">
                  <Icon name="upload" className="w-4 h-4" /> Загрузить
                </Button>
              </div>
            </div>
          ) : (
            <Button onClick={() => fileInputRef.current?.click()} className="self-start px-8">
              <Icon name="upload" className="w-4 h-4" /> Загрузить документ
            </Button>
          )}
        </div>
      )}

      {documents.length === 0 ? (
        <div className="text-center py-12 text-graphite-light font-medium">Документы не загружены</div>
      ) : (
        <div className="flex flex-col gap-2">
          {documents.map(doc => (
            <div key={doc.id} className="flex items-center justify-between p-3 bg-white/40 border border-graphite/10 rounded-md">
              <a href={getImageUrl(doc.file_url)} target="_blank" rel="noreferrer" className="flex items-center gap-3 text-graphite hover:text-orange transition-colors">
                <Icon name="handbook" className="w-5 h-5 shrink-0" />
                <span className="font-bold text-[14px] truncate max-w-[400px]">{doc.title}</span>
              </a>
              {canManage && (
                <button onClick={() => setDeleteId(doc.id)} className="p-2 text-graphite-light hover:text-status-rejected hover:bg-status-rejected/10 rounded-lg transition-colors shrink-0">
                  <Icon name="delete" className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmModal isOpen={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={handleConfirmDelete} isLoading={isDeleting} />
    </div>
  );
}

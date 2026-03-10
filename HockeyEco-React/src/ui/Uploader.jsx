import React, { useState, useRef, useEffect } from 'react';

export function Uploader({ label, accept = "*/*", heightClass = "h-[152px]", isDefaultPreview = false, mockText = "Заглушка", onFileSelect, initialUrl, emptyImage, canClear = true, disabled = false }) {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(initialUrl || null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!file) setPreviewUrl(initialUrl || null);
  }, [initialUrl, file]);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    if (onFileSelect) onFileSelect(selectedFile, false);

    const name = selectedFile.name.toLowerCase();
    if (name.endsWith('.pdf')) setPreviewUrl('PDF');
    else if (name.endsWith('.doc') || name.endsWith('.docx')) setPreviewUrl('DOC');
    else setPreviewUrl(URL.createObjectURL(selectedFile));
  };

  const handleClear = (e) => {
    e.stopPropagation();
    setFile(null);
    setPreviewUrl(null);
    if (onFileSelect) onFileSelect(null, true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const isPdf = previewUrl && (previewUrl.toLowerCase().includes('.pdf') || previewUrl === 'PDF');
  const isDoc = previewUrl && (previewUrl.toLowerCase().includes('.doc') || previewUrl.toLowerCase().includes('.docx') || previewUrl === 'DOC');
  const isDocument = isPdf || isDoc;

  return (
    <div className={`w-full font-sans flex flex-col ${heightClass}`}>
      {label && <span className="text-[11px] font-bold text-graphite-light mb-1.5 uppercase tracking-wide block text-center" dangerouslySetInnerHTML={{ __html: label }} />}
      <input type="file" ref={fileInputRef} hidden accept={accept} onChange={handleFileChange} />

      {!file && !previewUrl && (
        <div 
          onClick={() => !disabled && fileInputRef.current.click()}
          className={`flex-1 flex flex-col items-center justify-center gap-2 w-full transition-all duration-200 bg-center bg-no-repeat ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'} ${emptyImage ? 'bg-contain' : ''} ${isDefaultPreview ? 'border-2 border-dashed border-graphite/20 bg-graphite/5 rounded-2xl text-graphite-light font-bold text-[12px] uppercase text-center' : `border-2 border-dashed border-graphite/20 rounded-lg bg-white/40 ${disabled ? '' : 'hover:border-orange hover:bg-orange/5'}`}`}
          style={emptyImage ? { backgroundImage: `url(${emptyImage})`, backgroundSize: 'auto 75%' } : {}}
        >
          {!emptyImage && (
            isDefaultPreview ? (
              <div dangerouslySetInnerHTML={{ __html: mockText }} />
            ) : (
              <>
                <svg className="w-6 h-6 text-graphite-light opacity-50 mb-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>
                <div className="text-[11px] text-graphite-light font-medium text-center leading-tight">
                  {disabled ? 'Файл не загружен' : <>Перетащите файл или<br/><span className="text-orange underline cursor-pointer">выберите</span></>}
                </div>
              </>
            )
          )}
        </div>
      )}

      {(file || previewUrl) && (
        <div className="flex-1 flex flex-col items-center gap-2 animate-fade-in-down w-full h-full">
          <div 
            className={`group flex-1 w-full relative flex items-center justify-center ${disabled ? '' : 'cursor-pointer'} ${isDefaultPreview ? 'rounded-2xl' : 'rounded-xl'} ${isDocument ? 'bg-transparent transition-all duration-300' : 'bg-transparent bg-contain bg-no-repeat bg-center'}`}
            style={!isDocument ? { backgroundImage: `url(${previewUrl})` } : {}}
            onClick={() => !disabled && fileInputRef.current.click()}
          >
            {isPdf && (
              <div className="flex flex-col items-center justify-center w-full h-full">
                <span className="text-4xl font-black text-red-500 uppercase tracking-widest transition-transform duration-300 group-hover:scale-110 drop-shadow-sm">PDF</span>
              </div>
            )}
            
            {isDoc && (
              <div className="flex flex-col items-center justify-center w-full h-full">
                <span className="text-4xl font-black text-blue-500 uppercase tracking-widest transition-transform duration-300 group-hover:scale-110 drop-shadow-sm">DOC</span>
              </div>
            )}
          </div>
          
          <div className="flex gap-4 items-center justify-center h-[20px] shrink-0 relative z-10">
            {initialUrl && !file && (
              <a 
                href={initialUrl} 
                target="_blank" 
                rel="noopener noreferrer" 
                download
                onClick={(e) => e.stopPropagation()} 
                className="bg-none border-none text-[11px] font-semibold cursor-pointer transition-colors duration-200 underline underline-offset-[3px] text-status-pending hover:text-status-pending-hover"
              >
                Скачать
              </a>
            )}
            {(file || (initialUrl && canClear)) && !disabled && (
              <button onClick={handleClear} className="bg-none border-none text-[11px] font-semibold cursor-pointer transition-colors duration-200 underline underline-offset-[3px] text-status-rejected hover:text-status-rejected-hover">
                Сбросить
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
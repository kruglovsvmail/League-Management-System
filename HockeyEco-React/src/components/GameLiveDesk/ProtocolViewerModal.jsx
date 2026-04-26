// src/components/GameLiveDesk/PDF-Protocol/ProtocolViewerModal.jsx
import React, { useState, useEffect } from 'react';
import { getToken } from '../../utils/helpers';
import { Button } from '../../ui/Button';
import { Select } from '../../ui/Select';
import { Icon } from '../../ui/Icon';

export function ProtocolViewerModal({ isOpen, onClose, gameId }) {
  const [protocolData, setProtocolData] = useState(null);
  const [htmlContent, setHtmlContent] = useState(''); 
  const [isLoading, setIsLoading] = useState(true);
  
  const [formState, setFormState] = useState({});
  const [isSigning, setIsSigning] = useState(null); 
  const [zoom, setZoom] = useState(1.0);

  const headers = { 'Authorization': `Bearer ${getToken()}`, 'Content-Type': 'application/json' };

  const loadProtocolData = async () => {
    setIsLoading(true);
    try {
      const resJson = await fetch(`${import.meta.env.VITE_API_URL}/api/protocol/${gameId}`, { headers });
      const apiResponse = await resJson.json();
      if (apiResponse.success) {
          setProtocolData(apiResponse.data);
      }

      const resHtml = await fetch(`${import.meta.env.VITE_API_URL}/api/protocol/${gameId}/html`, { headers });
      if (resHtml.ok) {
          let htmlText = await resHtml.text();
          
          // Инъекция стилей для печати:
          // Ставим margin: 0 для самой страницы принтера.
          // Таким образом принтер не будет добавлять свои поля, 
          // а использует исключительно padding: 16pt, заложенный в protocol-default.js
          const printStyles = `
            <style>
              @media print {
                @page { size: A4; margin: 0; }
                body { 
                  margin: 0 !important; 
                  box-shadow: none !important;
                  -webkit-print-color-adjust: exact; 
                  print-color-adjust: exact; 
                }
              }
            </style>
          `;
          setHtmlContent(htmlText + printStyles);
      }
    } catch (err) { 
      console.error('Ошибка загрузки данных протокола:', err); 
    } finally { 
      setIsLoading(false); 
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadProtocolData();
      setFormState({});
      setIsSigning(null);
      setZoom(1.0);
    } else {
      setHtmlContent(''); 
    }
  }, [isOpen, gameId]);

  const updateForm = (role, field, value) => {
    setFormState(prev => ({ ...prev, [role]: { ...prev[role], [field]: value } }));
  };

  const handleSign = async (role, isPinless, prefilledUserId) => {
    const userId = prefilledUserId || formState[role]?.userId;
    const pinCode = formState[role]?.pin || '';

    if (!userId) {
      alert("Выберите пользователя из списка");
      return;
    }

    setIsSigning(role);
    try {
      const payload = { role, userId, pinCode };

      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/protocol/${gameId}/sign`, {
        method: 'POST', headers, body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (data.success) {
        setFormState(prev => { const next = { ...prev }; delete next[role]; return next; });
        await loadProtocolData(); 
      } else {
        alert(data.error || 'Ошибка подписания');
      }
    } catch (err) {
      alert('Ошибка соединения с сервером');
    } finally {
      setIsSigning(null);
    }
  };

  const handlePrint = () => {
    const iframe = document.getElementById('protocol-frame');
    if (iframe && iframe.contentWindow) {
      iframe.focus();
      iframe.contentWindow.print();
    }
  };

  const zoomIn = () => setZoom(prev => Math.min(prev + 0.1, 2.0));
  const zoomOut = () => setZoom(prev => Math.max(prev - 0.1, 0.5));

  if (!isOpen) return null;

  const signatures = protocolData?.signatures || {};

  const renderTeamSection = (teamType, teamName) => {
    const optionsSource = protocolData?.eligibleSigners?.[teamType] || { coaches: [], staff: [] };
    const roles = [
      { key: `${teamType}_coach`, label: 'Тренер', isPinless: true, options: optionsSource.coaches, opt: false },
      { key: `${teamType}_off1`, label: 'Офиц. лицо 1', isPinless: false, options: optionsSource.staff, opt: false },
      { key: `${teamType}_off2`, label: 'Офиц. лицо 2', isPinless: false, options: optionsSource.staff, opt: true },
    ];

    return (
      <div className="mb-2">
        <div className="bg-white rounded-lg border border-graphite/10 shadow-sm p-4">
           <h3 className="font-black text-[13px] text-graphite uppercase tracking-widest mb-1 flex items-center gap-2">
             <span className="bg-graphite text-white w-5 h-5 rounded flex items-center justify-center text-[10px]">{teamType === 'home' ? 'А' : 'Б'}</span>
             {teamName}
           </h3>
           
           <div className="flex flex-col w-full divide-y divide-graphite/10">
              {roles.map(r => {
                 const sig = signatures[r.key];
                 const isSigned = !!sig;
                 const isFullySigned = isSigned && !!sig.hash;
                 const isInscribed = isSigned && !sig.hash; 
                 
                 const selectOptions = r.options.map(opt => ({ value: opt.id, label: opt.name }));

                 let signedUserId = '';
                 if (isSigned) {
                    signedUserId = sig.user_id; 
                    if (signedUserId && !selectOptions.find(o => o.value === signedUserId)) {
                      selectOptions.push({ value: signedUserId, label: sig.name });
                    }
                 }

                 const currentUserId = isSigned ? signedUserId : (formState[r.key]?.userId || '');
                 const currentPin = formState[r.key]?.pin || '';

                 const isOfficialBtnDisabled = isSigning === r.key || 
                                               !currentUserId || 
                                               (currentPin.length > 0 && currentPin.length < 4) ||
                                               (isInscribed && currentPin.length !== 4);

                 return (
                    <div key={r.key} className="flex items-center gap-2 py-2 w-full">
                       <div className="w-[95px] shrink-0 font-bold text-[10px] text-graphite uppercase leading-tight">
                         {r.label}
                       </div>

                       <div className="flex-1 min-w-[130px]">
                          <Select 
                             options={selectOptions}
                             value={currentUserId}
                             onChange={(val) => {
                                updateForm(r.key, 'userId', val);
                             }}
                             placeholder="Выберите..."
                             isSearchable={true}
                             className={`w-full px-2 py-1.5 text-[11px] h-[34px] bg-white ${isSigned ? 'opacity-80' : ''}`}
                             disabled={isSigned || isSigning === r.key} 
                          />
                       </div>

                       {r.isPinless ? (
                          isSigned ? (
                             <div className="flex items-center justify-center bg-status-accepted/10 border border-status-accepted/20 h-[34px] px-2 rounded-md shrink-0 w-[95px]">
                                <span className="text-[9px] font-bold text-status-accepted uppercase flex items-center gap-1">
                                   <Icon name="save" className="w-3 h-3" />
                                   Вписано
                                </span>
                             </div>
                          ) : (
                             <Button 
                                onClick={() => handleSign(r.key, true, currentUserId)}
                                disabled={isSigning === r.key || !currentUserId}
                                isLoading={isSigning === r.key}
                                loadingText=""
                                className="w-[34px] h-[34px] p-0 !min-w-[34px] !px-0 shrink-0 shadow-sm flex items-center justify-center rounded-md"
                             >
                                {isSigning !== r.key && (
                                   <Icon name="save" className="w-4 h-4" />
                                )}
                             </Button>
                          )
                       ) : (
                          isFullySigned ? (
                             <div className="flex items-center justify-center bg-status-accepted/10 border border-status-accepted/20 h-[34px] px-2 rounded-md shrink-0 min-w-[95px]">
                                <span className="text-[9px] font-bold text-status-accepted uppercase flex items-center gap-1">
                                   <Icon name="save" className="w-3 h-3" />
                                   [{sig.hash}]
                                </span>
                             </div>
                          ) : (
                             <>
                               {isInscribed && (
                                   <div className="flex items-center h-[34px] px-1 mr-1">
                                      <span className="text-[9px] font-bold text-graphite-light uppercase border-b border-dashed border-graphite-light pb-0.5" title="Вписан в протокол, ожидается ЭЦП">Вписан</span>
                                   </div>
                               )}
                               <input 
                                  type="tel" 
                                  style={{ WebkitTextSecurity: 'disc' }}
                                  maxLength={4} 
                                  value={currentPin}
                                  onChange={(e) => updateForm(r.key, 'pin', e.target.value.replace(/\D/g, ''))}
                                  placeholder="••••"
                                  disabled={!currentUserId || isSigning === r.key}
                                  autoComplete="off"
                                  name={`code_${r.key}_${Math.random().toString(36).substring(7)}`}
                                  className="w-[50px] h-[34px] border border-graphite/30 rounded-md text-center font-bold text-[12px] text-graphite outline-none focus:border-orange disabled:opacity-50 transition-colors shrink-0"
                               />
                               <Button 
                                  onClick={() => handleSign(r.key, false, currentUserId)}
                                  disabled={isOfficialBtnDisabled}
                                  isLoading={isSigning === r.key}
                                  loadingText=""
                                  className="w-[34px] h-[34px] p-0 !min-w-[34px] !px-0 shrink-0 shadow-sm flex items-center justify-center rounded-md"
                               >
                                  {isSigning !== r.key && (
                                     <Icon name="save" className="w-4 h-4" />
                                  )}
                               </Button>
                             </>
                          )
                       )}
                    </div>
                 );
              })}
           </div>
        </div>
      </div>
    );
  };

  const renderOfficialsSection = () => {
    const officials = protocolData?.prefilledOfficials || {};
    const roles = [
      { key: 'head_1', label: 'Главный судья 1', user: officials['head_1'] },
      { key: 'head_2', label: 'Главный судья 2', user: officials['head_2'] },
      { key: 'scorekeeper', label: 'Секретарь', user: officials['scorekeeper'] },
    ];

    return (
      <div className="mb-6">
        <div className="bg-white rounded-lg border border-graphite/10 shadow-sm p-4">
           <h3 className="font-black text-[13px] text-graphite uppercase tracking-widest mb-3 flex items-center gap-2">
             <span className="bg-graphite text-white w-5 h-5 rounded flex items-center justify-center text-[10px]">
                <Icon name="whistle" className="w-3.5 h-3.5" />
             </span>
             Судейская бригада
           </h3>
           
           <div className="flex flex-col w-full divide-y divide-graphite/10">
              {roles.map(r => {
                 if (r.key === 'head_2' && !r.user) return null; 
                 
                 const sig = signatures[r.key];
                 const isFullySigned = !!sig && !!sig.hash; 
                 const currentPin = formState[r.key]?.pin || '';

                 return (
                    <div key={r.key} className="flex items-center gap-2 py-2 w-full">
                       <div className="w-[95px] shrink-0 font-bold text-[10px] text-graphite uppercase leading-tight">
                         {r.label}
                       </div>
                       
                       <div className="flex-1 px-3 bg-gray-50 border border-graphite/10 rounded-md text-[11px] font-semibold text-graphite truncate h-[34px] flex items-center">
                         {r.user?.name || 'Не назначен'}
                       </div>
                             
                       {r.user && (
                          isFullySigned ? (
                             <div className="flex items-center justify-center bg-status-accepted/10 border border-status-accepted/20 h-[34px] px-2 rounded-md shrink-0 min-w-[95px]">
                                <span className="text-[9px] font-bold text-status-accepted uppercase flex items-center gap-1">
                                   <Icon name="save" className="w-3 h-3" />
                                   [{sig.hash}]
                                </span>
                             </div>
                          ) : (
                             <>
                               <input 
                                  type="tel" 
                                  style={{ WebkitTextSecurity: 'disc' }}
                                  maxLength={4} 
                                  value={currentPin}
                                  onChange={(e) => updateForm(r.key, 'pin', e.target.value.replace(/\D/g, ''))}
                                  placeholder="••••"
                                  disabled={isSigning === r.key}
                                  autoComplete="off"
                                  name={`code_${r.key}_${Math.random().toString(36).substring(7)}`}
                                  className="w-[50px] h-[34px] border border-graphite/30 rounded-md text-center font-bold text-[12px] text-graphite outline-none focus:border-orange disabled:opacity-50 transition-colors shrink-0"
                               />
                               <Button 
                                  onClick={() => handleSign(r.key, false, r.user.id)}
                                  disabled={isSigning === r.key || currentPin.length < 4}
                                  isLoading={isSigning === r.key}
                                  loadingText=""
                                  className="w-[34px] h-[34px] p-0 !min-w-[34px] !px-0 shrink-0 shadow-sm flex items-center justify-center rounded-md"
                               >
                                  {isSigning !== r.key && (
                                     <Icon name="save" className="w-4 h-4" />
                                  )}
                               </Button>
                             </>
                          )
                       )}
                    </div>
                 );
              })}
           </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[10000] flex bg-black animate-zoom-in">
      
      {/* ЛЕВАЯ ЧАСТЬ - ПРОСМОТР */}
      <div className="flex-1 h-full relative overflow-hidden bg-[#bababaff] flex flex-col">
        {isLoading ? (
           <div className="w-full h-full flex items-center justify-center text-white">
              <svg className="w-10 h-10 animate-spin text-orange" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
           </div>
        ) : (
           <>
              {/* ПАНЕЛЬ ИНСТРУМЕНТОВ: ГОРИЗОНТАЛЬНАЯ ПО ЦЕНТРУ СВЕРХУ (glassmorphism) */}
              <div className="absolute top-2 left-1/2 -translate-x-1/2 flex items-center gap-5 bg-white/10 backdrop-blur-[6px] border border-white/30 text-graphite px-6 py-2.5 rounded-full shadow-2xl z-50">
                  <button 
                      onClick={handlePrint} 
                      className="flex items-center gap-2 hover:text-orange transition-colors uppercase text-[11px] font-bold tracking-wider border-r border-white/50 pr-5" 
                      title="Напечатать протокол"
                  >
                      <Icon name="clock" className="w-4 h-4" />
                      Печать
                  </button>
                  
                  <div className="flex items-center gap-4 pl-1">
                      <button onClick={zoomOut} className="w-9 h-9 flex items-center justify-center rounded-[12px] hover:text-orange hover:bg-white/20 transition-colors font-black text-2xl leading-none" title="Уменьшить масштаб">-</button>
                      <span className="text-[16px] font-mono font-black min-w-[40px] text-center">{Math.round(zoom * 100)}%</span>
                      <button onClick={zoomIn} className="w-9 h-9 flex items-center justify-center rounded-[12px] hover:text-orange hover:bg-white/20 transition-colors font-black text-2xl leading-none" title="Увеличить масштаб">+</button>
                  </div>
              </div>

              {/* ЦЕНТРИРОВАННЫЙ ЛИСТ А4 */}
              <div className="flex-1 overflow-auto w-full flex justify-center py-20 custom-scrollbar">
                  <div 
                      className="bg-white shadow-[0_0_50px_rgba(0,0,0,0.6)] transition-transform duration-200"
                      style={{ 
                          width: '210mm', 
                          height: '297mm',
                          transform: `scale(${zoom})`,
                          transformOrigin: 'top center',
                          margin: `0 ${Math.max(0, (zoom - 1) * 210 / 2)}mm`,
                          marginBottom: `${(zoom - 1) * 297}mm`
                      }}
                  >
                      <iframe 
                         id="protocol-frame"
                         srcDoc={htmlContent} 
                         className="w-full h-full border-none pointer-events-none" 
                         title="Официальный протокол матча"
                      />
                  </div>
              </div>
           </>
        )}
      </div>

      {/* ПРАВАЯ ЧАСТЬ - ПОДПИСИ */}
      <div className="w-[480px] h-full bg-[#F4F5F7] flex flex-col shadow-[-20px_0_40px_rgba(0,0,0,0.2)] z-10 shrink-0">
        <div className="px-6 py-3 border-b border-graphite/10 flex justify-between items-center bg-white shrink-0 shadow-sm z-20">
          <div className="flex flex-col">
            <h2 className="font-black text-[18px] text-graphite uppercase tracking-tight">Подписание протокола</h2>
          </div>
          <button 
            onClick={onClose} 
            className="text-graphite/60 hover:text-white bg-gray-50 hover:bg-status-rejected transition-colors p-2 rounded-lg border border-graphite/10"
          >
            <Icon name="close" className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-2 custom-scrollbar">
          {protocolData && (
             <div className="w-full">
                <input type="password" style={{ position: 'absolute', opacity: 0, width: 0, height: 0, border: 'none' }} tabIndex="-1" />
                
                {renderTeamSection('home', protocolData.home?.name || '')}
                {renderTeamSection('away', protocolData.away?.name || '')}
                {renderOfficialsSection()}
             </div>
          )}
        </div>
      </div>
    </div>
  );
}
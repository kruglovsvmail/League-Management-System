import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Uploader } from '../ui/Uploader';
import { Calendar } from '../ui/Calendar';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { AccessFallback } from '../ui/AccessFallback';
import { DOCUMENT_ACCEPT } from '../utils/uploadFormats';
import { getImageUrl } from '../utils/helpers';

// Документы резервного вратаря лиги — только те, что лига сделала обязательными.
//
// Медсправка и полис — один файл на человека: он же лежит в заявках его команд.
// Загрузка здесь заменяет документ и в заявках выбранного сезона, загрузка в заявке
// команды — здесь (сервер: reserveGoalieController.uploadReserveGoalieDocs и триггер
// reserve_goalie_docs_from_application в базе).
//
// Согласие одно на «человек + сезон» и общее с заявками: загрузить или заменить его
// отсюда можно, а очистить — только если человек не заявлен в команду этого сезона.

const clearWarning = (docName) =>
  `Файл «${docName}» будет удалён из хранилища, когда вы нажмёте «Сохранить». Восстановить его после этого нельзя.`;

// Медсправка и полис общие с заявками: сброс убирает их и там
const sharedClearWarning = (docName) =>
  `Документ «${docName}» будет убран и из заявок команды этого сезона, когда вы нажмёте «Сохранить». Восстановить файл после этого нельзя.`;

const safeDate = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? null : d;
};

const formatForDB = (val) => {
  if (!val) return '';
  const d = new Date(val);
  if (isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function DocBlock({ title, children }) {
  return (
    <div className="flex flex-col gap-[15px] bg-white p-6 rounded-2xl border border-graphite/10 shadow-sm">
      <span className="text-[12px] font-bold text-graphite-light uppercase tracking-wide mb-1">{title}</span>
      {children}
    </div>
  );
}

export function ReserveGoalieDocsDrawer({ isOpen, onClose, goalie, seasonName, required, onSave, isSaving = false, canManage = false }) {
  const [medFile, setMedFile] = useState(null);
  const [insFile, setInsFile] = useState(null);
  const [consentFile, setConsentFile] = useState(null);
  const [medCleared, setMedCleared] = useState(false);
  const [insCleared, setInsCleared] = useState(false);
  const [consentCleared, setConsentCleared] = useState(false);
  const [medExp, setMedExp] = useState(null);
  const [insExp, setInsExp] = useState(null);
  const [consentExp, setConsentExp] = useState(null);

  useEffect(() => {
    if (!isOpen || !goalie) return;
    setMedFile(null); setInsFile(null); setConsentFile(null);
    setMedCleared(false); setInsCleared(false); setConsentCleared(false);
    setMedExp(safeDate(goalie.own_medical_expires_at));
    setInsExp(safeDate(goalie.own_insurance_expires_at));
    setConsentExp(safeDate(goalie.consent_expires_at));
  }, [isOpen, goalie]);

  const readOnly = !canManage;

  // Блоки только тех документов, которые лига сделала обязательными (шторка «Параметры»).
  // Необязательные не показываем и не отправляем: null — «поле не трогать».
  const handleSave = () => {
    onSave({
      medFile: required.medical ? medFile : null,
      medCleared: required.medical ? medCleared : false,
      medExp: required.medical ? formatForDB(medExp) : null,
      insFile: required.insurance ? insFile : null,
      insCleared: required.insurance ? insCleared : false,
      insExp: required.insurance ? formatForDB(insExp) : null,
      consentFile: required.consent ? consentFile : null,
      consentCleared: required.consent ? consentCleared : false,
      consentExp: required.consent ? formatForDB(consentExp) : null,
    });
  };

  const name = goalie ? `${goalie.last_name} ${goalie.first_name}` : '';

  // Сетка под число блоков — как в окне документов состава дивизиона
  const activeBlocks = [required.medical, required.insurance, required.consent].filter(Boolean).length;
  let gridCols = 'md:grid-cols-3';
  if (activeBlocks === 2) gridCols = 'md:grid-cols-2 max-w-[800px] mx-auto';
  if (activeBlocks === 1) gridCols = 'md:grid-cols-1 max-w-[400px] mx-auto';

  const content = (
    <div className={`fixed inset-0 z-[35] transition-opacity duration-300 ${isOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
      <div className="absolute inset-0 bg-graphite/60 backdrop-blur-sm" onClick={onClose}></div>

      <div className={`absolute top-0 right-0 h-full w-full max-w-[1100px] bg-[#F8F9FA] transform transition-transform duration-300 flex flex-col shadow-2xl ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>

        <div className="flex items-center justify-between px-8 py-5 border-b border-graphite/10 bg-white shrink-0">
          <h2 className="font-black text-xl text-graphite tracking-wide uppercase">
            Документы{name ? `: ${name}` : ''}
          </h2>
          <button onClick={onClose} className="text-graphite-light hover:text-orange transition-colors">
            <Icon name="close" className="w-6 h-6" />
          </button>
        </div>

        {readOnly && (
          <div className="px-8 pt-6 pb-0">
            <AccessFallback variant="readonly" message="Режим просмотра. Загрузка документов недоступна." />
          </div>
        )}

        {goalie && (
          <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-5 flex flex-col gap-4">
            {goalie.has_application && (
              <div className="text-[12px] text-graphite-light leading-snug text-center">
                Вратарь заявлен в команду в этом сезоне — документы общие с заявкой: замена здесь меняет их и там.
              </div>
            )}

            <div className={`grid grid-cols-1 ${gridCols} gap-6 h-fit w-full`}>
              {required.medical && (
                <DocBlock title="Медицинская справка">
                  <Uploader
                    heightClass="h-[100px]"
                    accept={DOCUMENT_ACCEPT}
                    initialUrl={goalie.own_medical_url ? getImageUrl(goalie.own_medical_url) : null}
                    onFileSelect={(file, cleared) => { setMedFile(file); setMedCleared(cleared); }}
                    disabled={readOnly}
                    confirmClear={sharedClearWarning('Медицинская справка')}
                  />
                  <Calendar value={medExp} onChange={setMedExp} disabled={readOnly} />
                </DocBlock>
              )}

              {required.insurance && (
                <DocBlock title="Страховой полис">
                  <Uploader
                    heightClass="h-[100px]"
                    accept={DOCUMENT_ACCEPT}
                    initialUrl={goalie.own_insurance_url ? getImageUrl(goalie.own_insurance_url) : null}
                    onFileSelect={(file, cleared) => { setInsFile(file); setInsCleared(cleared); }}
                    disabled={readOnly}
                    confirmClear={sharedClearWarning('Страховой полис')}
                  />
                  <Calendar value={insExp} onChange={setInsExp} disabled={readOnly} />
                </DocBlock>
              )}

              {required.consent && (
                <DocBlock title="Согласие на обработку данных">
                  <Uploader
                    heightClass="h-[100px]"
                    accept={DOCUMENT_ACCEPT}
                    initialUrl={goalie.consent_url ? getImageUrl(goalie.consent_url) : null}
                    onFileSelect={(file, cleared) => { setConsentFile(file); setConsentCleared(cleared); }}
                    disabled={readOnly}
                    canClear={!goalie.has_application}
                    confirmClear={clearWarning('Согласие на обработку данных')}
                  />
                  <Calendar value={consentExp} onChange={setConsentExp} disabled={readOnly} />
                </DocBlock>
              )}
            </div>
          </div>
        )}

        {!readOnly && (
          <div className="px-8 py-5 border-t border-graphite/10 bg-white shrink-0 flex justify-end">
            <Button onClick={handleSave} isLoading={isSaving} className="min-w-[160px] py-3">
              Сохранить
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

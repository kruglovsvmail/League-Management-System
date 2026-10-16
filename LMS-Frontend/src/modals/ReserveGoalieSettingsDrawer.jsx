import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Switch } from '../ui/Switch';
import { Stepper } from '../ui/Stepper';
import { Button } from '../ui/Button';
import { Icon } from '../ui/Icon';
import { AccessFallback } from '../ui/AccessFallback';

// Шторка «Параметры» на вкладке «Резерв. вратари». Всё про механику — одно правило
// на всю лигу: включена ли она, правила на матч, дисциплина и какие документы
// обязательны. Две колонки, чтобы всё помещалось без прокрутки. Сохраняется одной
// кнопкой, целиком.

const DEFAULTS = {
  reserve_goalies_enabled: false,
  reserve_goalie_dq_games_enabled: true,
  reserve_goalie_own_dq_blocks: true,
  reserve_goalie_max_per_game: 1,
  reserve_goalie_block_back_to_back: false,
  reserve_goalie_block_with_own_goalie: false,
  reserve_goalie_req_med_cert: false,
  reserve_goalie_req_insurance: false,
  reserve_goalie_req_consent: false,
};

function Row({ title, hint, children, first = false }) {
  return (
    <div className={`flex justify-between items-center gap-4 px-5 py-3 ${first ? '' : 'border-t border-graphite/5'}`}>
      <div className="min-w-0">
        <div className="text-[13px] font-bold text-graphite">{title}</div>
        {hint && <div className="text-[11px] text-graphite-light mt-0.5 leading-snug">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Section({ icon, title, children }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Icon name={icon} className="w-4 h-4 text-graphite/40" />
        <span className="text-[11px] font-black text-graphite/40 uppercase tracking-widest">{title}</span>
      </div>
      <div className="bg-white border border-graphite/5 shadow-sm rounded-md">{children}</div>
    </div>
  );
}

export function ReserveGoalieSettingsDrawer({ isOpen, onClose, settings, onSave, isSaving = false, canManage = false }) {
  const [form, setForm] = useState(DEFAULTS);

  // Каждое открытие — с того, что сейчас сохранено: несохранённые правки не переживают закрытие
  useEffect(() => {
    if (isOpen) setForm({ ...DEFAULTS, ...(settings || {}) });
  }, [isOpen, settings]);

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }));
  const disabled = !canManage;
  const enabled = !!form.reserve_goalies_enabled;

  const toggle = (key) => (
    <Switch checked={!!form[key]} onChange={(e) => set(key, e.target.checked)} disabled={disabled} />
  );

  const content = (
    <div className={`fixed inset-0 z-[35] transition-opacity duration-300 ${isOpen ? 'opacity-100 visible' : 'opacity-0 invisible'}`}>
      <div className="absolute inset-0 bg-graphite/60 backdrop-blur-sm" onClick={onClose}></div>

      <div className={`absolute top-0 right-0 h-full w-[980px] max-w-full bg-[#F8F9FA] transform transition-transform duration-300 ease-out flex flex-col shadow-2xl ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>

        <div className="flex items-center justify-between px-8 py-5 border-b border-graphite/10 bg-white shrink-0">
          <h2 className="font-black text-[18px] text-graphite uppercase tracking-wide">Параметры резерва</h2>
          <button onClick={onClose} className="text-graphite-light hover:text-orange transition-colors">
            <Icon name="close" className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-5 custom-scrollbar flex flex-col gap-5">
          {disabled && (
            <AccessFallback variant="readonly" message="У вас нет прав менять параметры резервных вратарей. Вы находитесь в режиме просмотра." />
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

            {/* Левая колонка: механика и правила на матч */}
            <div className="flex flex-col gap-5">
              <Section icon="swap" title="Механика">
                <Row
                  first
                  title="Использовать резервных вратарей"
                  hint="Выключено — в шторке «Состав на матч» блока резервных нет, а в Team Room и на сайте лиги список не показывается. Сыгранные матчи и статистика остаются."
                >
                  {toggle('reserve_goalies_enabled')}
                </Row>
              </Section>

              {/* Остальное нужно только при включённой механике */}
              {enabled && (
                <Section icon="matches" title="Правила на матч">
                  <Row
                    first
                    title="Резервных вратарей на матч"
                    hint="Сколько приглашённых вратарей одна команда может заявить на один матч."
                  >
                    <Stepper
                      initialValue={form.reserve_goalie_max_per_game ?? 1}
                      onChange={(v) => set('reserve_goalie_max_per_game', v)}
                      min={1}
                      max={3}
                      disabled={disabled}
                    />
                  </Row>
                  <Row
                    title="Нельзя два матча подряд за одну команду"
                    hint="Вратарь, сыгравший за команду её предыдущий матч в этом дивизионе, у секретаря виден серым с пояснением, за какой матч он уже играл."
                  >
                    {toggle('reserve_goalie_block_back_to_back')}
                  </Row>
                  <Row
                    title="Нельзя, если в составе есть свой вратарь"
                    hint="Резервного можно добавить в состав на матч, только если в нём нет вратаря самой команды. Уже вписанных в протокол не касается."
                  >
                    {toggle('reserve_goalie_block_with_own_goalie')}
                  </Row>
                </Section>
              )}
            </div>

            {/* Правая колонка: дисциплина и документы */}
            {enabled && (
              <div className="flex flex-col gap-5">
                <Section icon="disqualifications" title="Дисциплина">
                  <Row
                    first
                    title="Наказывать матчами"
                    hint="Резервному вратарю можно назначить пропуск матчей. Отсчёт идёт по календарю той команды, за которую он выходил и получил наказание. Выключено — остаётся только денежный штраф."
                  >
                    {toggle('reserve_goalie_dq_games_enabled')}
                  </Row>
                  <Row
                    title="Дисквалификация закрывает резерв"
                    hint="Пока вратарь отбывает наказание, полученное в своей команде, его нельзя вписать резервным за другие. Наказание, полученное именно резервным, закрывает его везде в любом случае."
                  >
                    {toggle('reserve_goalie_own_dq_blocks')}
                  </Row>
                </Section>

                <Section icon="registry" title="Обязательные документы">
                  <div className="px-5 pt-3 text-[11px] text-graphite-light leading-snug">
                    Нет документа или он истёк — вратаря не видно в HockeyEco TR, а у секретаря он серый
                    с причиной. Документы из заявки команды в том же сезоне засчитываются сами.
                    Ничего не выбрано — документы у резерва не ведутся.
                  </div>
                  <Row first title="Медицинская справка">
                    {toggle('reserve_goalie_req_med_cert')}
                  </Row>
                  <Row title="Страховой полис">
                    {toggle('reserve_goalie_req_insurance')}
                  </Row>
                  <Row title="Согласие на обработку данных" hint="На сезон дивизиона, в котором проходит матч.">
                    {toggle('reserve_goalie_req_consent')}
                  </Row>
                </Section>
              </div>
            )}
          </div>
        </div>

        {canManage && (
          <div className="px-8 py-5 border-t border-graphite/10 bg-white shrink-0 flex justify-end">
            <Button onClick={() => onSave(form)} isLoading={isSaving} className="min-w-[160px] py-3">
              Сохранить
            </Button>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

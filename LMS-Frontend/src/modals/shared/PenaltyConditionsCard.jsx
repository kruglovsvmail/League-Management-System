import React from 'react';
import { Input } from '../../ui/Input';
import { Stepper } from '../../ui/Stepper';

export const formatRangeHint = (min, max, suffix = '', separator = '–') => {
  if (min == null && max == null) return null;
  const minR = Math.round(Number(min));
  const maxR = max == null ? null : Math.round(Number(max));
  if (maxR == null || minR === maxR) return `Рекомендация: ${minR}${suffix}`;
  return `Рекомендация: ${minR}${separator}${maxR}${suffix}`;
};

// Живые значения, определяющие снятие дисквалификации по совокупности введённых полей —
// используются и для валидации формы, и для итогового расчёта penalty_games/penalty_amount/penalty_logic.
export function computeLiveAdditional(additionalAmountInput, additionalGamesInput) {
  const liveAdditionalAmount = additionalAmountInput === '' ? 0 : Number(additionalAmountInput);
  const liveNeedsChoice = Number(additionalGamesInput) > 0 && liveAdditionalAmount > 0;
  return { liveAdditionalAmount, liveNeedsChoice };
}

// Итоговые penalty_games/penalty_amount/penalty_logic/mandatoryGames/additionalGames на основе введённых
// значений. Работает одинаково для пункта из справочника (СДК) и для ручного/лайт-назначения. Обязательные
// матчи отбываются всегда. Если заполнены и доп.матчи, и доп.штраф — оба фиксируются одновременно с
// penalty_logic='or': нарушитель сам гасит дисквал тем, что наступит раньше (отбыл матчи целиком ИЛИ
// оплатил штраф) — комиссия/администратор здесь ничего не выбирают.
export function computePenaltyFromInputs({ targetType, mandatoryGamesInput, additionalGamesInput, additionalAmountInput }) {
  if (targetType === 'team') {
    return { games: null, amount: additionalAmountInput === '' ? null : Number(additionalAmountInput), logic: null, mandatoryGames: null, additionalGames: null };
  }
  const mandatoryVal = Number(mandatoryGamesInput) || 0;
  const additionalGamesVal = Number(additionalGamesInput) || 0;
  const gamesTotal = mandatoryVal + additionalGamesVal;
  const amountVal = additionalAmountInput === '' ? null : Number(additionalAmountInput);
  const { liveNeedsChoice } = computeLiveAdditional(additionalAmountInput, additionalGamesInput);
  const breakdown = { mandatoryGames: mandatoryVal > 0 ? mandatoryVal : null, additionalGames: additionalGamesVal > 0 ? additionalGamesVal : null };

  if (liveNeedsChoice) {
    return { games: gamesTotal, amount: amountVal, logic: 'or', ...breakdown };
  }
  if (amountVal > 0 && mandatoryVal > 0) {
    // Доп.деньги без альтернативы матчами, но обязательные матчи всё равно есть — оба условия обязательны.
    return { games: mandatoryVal, amount: amountVal, logic: 'and', ...breakdown };
  }
  if (amountVal > 0) {
    return { games: null, amount: amountVal, logic: null, ...breakdown };
  }
  return { games: gamesTotal > 0 ? gamesTotal : null, amount: null, logic: null, ...breakdown };
}

export function arePenaltyFieldsValid({ targetType, mandatoryGamesInput, additionalGamesInput, additionalAmountInput }) {
  if (targetType === 'team') return Number(additionalAmountInput) > 0;
  const mandatoryVal = Number(mandatoryGamesInput) || 0;
  const additionalGamesVal = Number(additionalGamesInput) || 0;
  const { liveAdditionalAmount } = computeLiveAdditional(additionalAmountInput, additionalGamesInput);
  return (mandatoryVal + additionalGamesVal) > 0 || liveAdditionalAmount > 0;
}

// Карточка "Обязательные условия"/"Дополнительные условия" — общая для шторки решения СДК (где есть
// selectedViolation с рекомендациями из справочника) и лайт-модалки (без справочника, selectedViolation
// не передаётся). Для цели "команда" — только денежный штраф, без счётчика матчей.
export function PenaltyConditionsCard({
  targetType, selectedViolation,
  mandatoryGamesInput, setMandatoryGamesInput,
  additionalGamesInput, setAdditionalGamesInput,
  additionalAmountInput, setAdditionalAmountInput
}) {
  const { liveAdditionalAmount, liveNeedsChoice } = computeLiveAdditional(additionalAmountInput, additionalGamesInput);

  if (targetType === 'team') {
    return (
      <div className="flex flex-col gap-1">
        <Input label="Штраф, ₽" type="number" value={additionalAmountInput} onChange={e => setAdditionalAmountInput(e.target.value.replace(/[^\d]/g, ''))} />
        {formatRangeHint(selectedViolation?.additional_amount_min, selectedViolation?.additional_amount_max, ' ₽') && (
          <span className="text-[10px] text-graphite-light px-0.5">{formatRangeHint(selectedViolation?.additional_amount_min, selectedViolation?.additional_amount_max, ' ₽')}</span>
        )}
        <p className="text-[10px] text-graphite/50 leading-relaxed px-0.5 mt-1">Для цели «Команда» доступен только денежный штраф.</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-bold text-graphite-light uppercase tracking-wide">Обязательные условия</span>
        <div className="flex items-center justify-between gap-3 bg-white rounded-md border border-graphite/10 px-4 py-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] font-bold text-graphite">Матчи</span>
            <span className="text-[10px] text-graphite-light">
              {formatRangeHint(selectedViolation?.mandatory_games_min, selectedViolation?.mandatory_games_max, '', '...') || 'Не указано в справочнике'}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Stepper initialValue={mandatoryGamesInput} min={0} max={30} onChange={setMandatoryGamesInput} />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 pt-4 border-t border-graphite/10">
        <span className="text-[11px] font-bold text-graphite-light uppercase tracking-wide">Дополнительные условия</span>

        <div className="flex items-center justify-between gap-3 bg-white rounded-md border border-graphite/10 px-4 py-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] font-bold text-graphite">Доп. матчи</span>
            <span className="text-[10px] text-graphite-light">
              {formatRangeHint(selectedViolation?.additional_games, selectedViolation?.additional_games, '', '...') || 'Не указано в справочнике'}
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Stepper initialValue={additionalGamesInput} min={0} max={30} onChange={setAdditionalGamesInput} />
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 bg-white rounded-md border border-graphite/10 px-4 py-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[13px] font-bold text-graphite">Доп. штраф</span>
            <span className="text-[10px] text-graphite-light">
              {formatRangeHint(selectedViolation?.additional_amount_min, selectedViolation?.additional_amount_max, ' ₽') || 'Не указано в справочнике'}
            </span>
          </div>
          <div className="relative shrink-0">
            <Input type="number" value={additionalAmountInput} onChange={e => setAdditionalAmountInput(e.target.value.replace(/[^\d]/g, ''))} className="w-[114px] pl-2.5 pr-6 py-2 text-right" />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[13px] font-bold text-graphite-light pointer-events-none">₽</span>
          </div>
        </div>

        {!liveNeedsChoice && liveAdditionalAmount > 0 && Number(mandatoryGamesInput) > 0 && (
          <span className="text-[10px] text-graphite/50 px-0.5">Начисляется вместе с обязательными матчами, без выбора.</span>
        )}
      </div>
    </>
  );
}

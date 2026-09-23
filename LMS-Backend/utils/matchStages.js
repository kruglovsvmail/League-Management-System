// LMS-Backend/utils/matchStages.js
// Карусель этапов матча в панели секретаря: разминка → 1-й период → перерыв 1 → … →
// последний период → перерыв → овертайм → буллиты. Портировано 1:1 в
// LMS-Frontend/src/components/GameLiveDesk/matchStages.js — менять оба файла вместе.
//
// Ключи этапов: 'WU' — разминка, '1'…'N' — периоды, 'B1'…'BN' — перерыв после периода
// с этим номером, 'OT' — овертайм, 'SO' — серия буллитов. Периоды, овертайм и буллиты
// лежат в timer.period, как и раньше, — табло, диктор и протокол про карусель не знают.
// Разминка и перерывы — в timer.stage, со своими часами: игровое время в это время стоит.
//
// Что есть в карусели, решают настройки матча (они же из дивизиона):
//   • разминка — если её длительность больше нуля;
//   • перерывы — если их длительность больше нуля: между периодами и перед овертаймом;
//     перед буллитами перерыва нет — ни после овертайма, ни сразу после периодов;
//   • овертайм и буллиты — если включены.

export const isPauseStage = (key) => key === 'WU' || /^B\d+$/.test(String(key));

// Место этапа в матче: по нему ищем соседей, даже если текущего этапа в карусели уже нет
// (например, перерывы выключили, пока шёл перерыв).
export const stageRank = (key) => {
  const k = String(key);
  if (k === 'WU') return 0;
  if (k === 'OT') return 10000;
  if (k === 'SO') return 10001;
  if (/^B\d+$/.test(k)) return Number(k.slice(1)) * 2 + 1;
  const n = parseInt(k, 10);
  return Number.isNaN(n) ? -1 : n * 2;
};

export const buildMatchStages = ({ periodsCount, otLength, soLength, warmupLength, breakLength }) => {
  const count = parseInt(periodsCount, 10) || 3;
  const hasOt = (parseInt(otLength, 10) || 0) > 0;
  const hasSo = (parseInt(soLength, 10) || 0) > 0;
  const hasBreaks = (parseInt(breakLength, 10) || 0) > 0;

  const stages = [];
  if ((parseInt(warmupLength, 10) || 0) > 0) stages.push('WU');
  for (let p = 1; p <= count; p++) {
    stages.push(String(p));
    if (hasBreaks && (p < count || hasOt)) stages.push(`B${p}`);
  }
  if (hasOt) stages.push('OT');
  if (hasSo) stages.push('SO');
  return stages;
};

export const nextStageKey = (stages, key) => stages.find((s) => stageRank(s) > stageRank(key)) ?? null;

// Длительность разминки или перерыва в секундах.
export const pauseStageSeconds = (key, { warmupLength, breakLength }) => {
  const minutes = key === 'WU' ? warmupLength : breakLength;
  return Math.max(0, parseInt(minutes, 10) || 0) * 60;
};

// src/components/WebGraphics/Graphics_3/EventOverlay.jsx
//
// Гол / штраф — широкая светлая плашка по центру снизу. Портрет игрока взят в
// серебряное кольцо и ВЫСТУПАЕТ над верхней кромкой: круг — главная форма лиги,
// и он же не даёт плашке читаться простым прямоугольником. Номер игрока справа
// набит в тёмную «шайбу».
import React from 'react';
import { getSafeUrl } from '../../../utils/graphicsHelpers';
import { Reveal } from './Reveal';
import { Glass, Dark, Portrait, Rule } from './Frost';
import { Display, Head, Num, Label, Pill } from './Type';
import { T, R, GOAL_STRENGTH, periodLabel } from './theme';

const CARD_W = 1220;
// Высота посчитана под самый плотный вариант: шапка + фамилия 64px + имя +
// линейка + строка передач/штрафа. Занижать нельзя — Glass режет по overflow,
// и первой уходит именно нижняя строка (передачи, минуты штрафа).
const CARD_H = 252;
const CARD_TOP = 62;        // на сколько портрет выступает над плашкой
const PHOTO = 200;
const PHOTO_X = 44;

export default function EventOverlay({ game, overlay }) {
  if (!overlay.data) return null;

  const isVisible = overlay.visible && (overlay.type === 'goal' || overlay.type === 'penalty');
  const isGoal = overlay.type === 'goal';

  const homeShort = game.home_short_name || game.home_team_name?.substring(0, 3).toUpperCase() || 'ХОЗ';
  const awayShort = game.away_short_name || game.away_team_name?.substring(0, 3).toUpperCase() || 'ГОС';

  const teamLogo = getSafeUrl(overlay.data?.team_logo);
  const isHomeEvent = overlay.data?.team_id === game.home_team_id;
  const teamShort = isHomeEvent ? homeShort : awayShort;
  const teamColor = (isHomeEvent ? game.home_color_1 : game.away_color_1) || T.acc;
  const accent = isGoal ? T.acc : T.danger;

  // Номер: сначала заявка на матч, потом любые поля самого события.
  const roster = isHomeEvent ? game.home_roster : game.away_roster;
  const matched = roster?.find(p =>
    p.last_name === overlay.data?.primary_last_name &&
    p.first_name === overlay.data?.primary_first_name
  );
  const playerNumber =
    matched?.jersey_number ||
    overlay.data?.player_number ||
    overlay.data?.jersey_number ||
    overlay.data?.primary_jersey_number ||
    '00';

  const strengthLabel = isGoal ? GOAL_STRENGTH[overlay.data?.goal_strength] : null;
  const periodText = overlay.data?.period ? periodLabel(overlay.data.period) : null;
  const assists = [overlay.data.assist1_last_name, overlay.data.assist2_last_name].filter(Boolean);

  // Портрет берём из данных события; Portrait ждёт объект человека и сам
  // подставляет заглушку, если фото нет.
  const person = {
    avatar_url: overlay.data?.primary_photo_url,
    last_name: overlay.data?.primary_last_name,
    first_name: overlay.data?.primary_first_name,
  };

  return (
    <Reveal isVisible={isVisible} variant="rise" className="absolute bottom-14 left-1/2 z-50">
      <div className="relative" style={{ width: CARD_W, height: CARD_TOP + CARD_H }}>

        {/* Позиционирование вынесено в обёртку: у Glass на корне свой position,
            и класс absolute на нём не сработал бы */}
        <div className="absolute left-0 right-0 bottom-0" style={{ height: CARD_H }}>
        <Glass over="video" radius={R.card} style={{ height: '100%' }}>
          {/* Цветная кромка команды по нижнему краю — единственное место, где
              в этой плашке появляется клубный цвет крупным пятном */}
          <div className="absolute left-0 right-0 bottom-0 h-[5px] z-20" style={{ backgroundColor: teamColor }} />

          <div
            className="h-full flex flex-col justify-center g3-seq"
            style={{ paddingLeft: PHOTO_X + PHOTO + 46, paddingRight: 200 }}
          >
            {/* Шапка события */}
            <div className="flex items-center gap-4 mb-5">
              <Pill size={14} bg={accent} color={T.white} border={accent} className="px-5">
                {isGoal ? 'ГОЛ' : 'ШТРАФ'}
              </Pill>

              <div className="flex items-center gap-3">
                {teamLogo && (
                  <img src={teamLogo} alt="" className="w-8 h-8 object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
                )}
                <Label size={12} color={T.body} tracking="0.22em" weight={800}>{teamShort}</Label>
              </div>

              {periodText && (
                <>
                  <div className="rounded-full" style={{ width: 5, height: 5, backgroundColor: T.brdSoft }} />
                  <Label size={12} color={T.label} tracking="0.22em">{periodText}</Label>
                </>
              )}

              {strengthLabel && <Pill size={11} className="ml-1">{strengthLabel}</Pill>}
            </div>

            {/* Игрок */}
            <div className="truncate">
              <Display size={64}>{overlay.data.primary_last_name}</Display>
            </div>
            <div className="mt-3.5">
              <Label size={22} color={T.accNum} tracking="0.16em" weight={800}>{overlay.data.primary_first_name}</Label>
            </div>

            <Rule className="mt-5 mb-4" tone="silver" />

            {/* Передачи / детали штрафа */}
            {isGoal ? (
              assists.length > 0 ? (
                <div className="flex items-baseline gap-4 min-w-0">
                  <Label size={11} color={T.label} tracking="0.3em">ПЕРЕДАЧИ</Label>
                  <Head size={22} color={T.body} className="truncate">{assists.join('   ·   ')}</Head>
                </div>
              ) : (
                <Label size={13} color={T.muted} tracking="0.26em">БЕЗ АССИСТЕНТОВ</Label>
              )
            ) : (
              <div className="flex items-center gap-5 min-w-0">
                <div className="flex items-baseline gap-2 shrink-0">
                  <Num size={32} color={T.danger}>{overlay.data.penalty_minutes}</Num>
                  <Label size={13} color={T.danger} tracking="0.18em" weight={800}>МИН</Label>
                </div>
                <div className="w-px h-6 shrink-0" style={{ backgroundColor: T.divider }} />
                <Head size={20} color={T.body} className="truncate">{overlay.data.penalty_violation}</Head>
              </div>
            )}
          </div>

          {/* Номер игрока в тёмной «шайбе» */}
          <div className="absolute right-11 top-1/2 -translate-y-1/2 z-20" style={{ width: 128, height: 128 }}>
            <Dark radius={R.pill} style={{ width: '100%', height: '100%' }}>
              <div className="w-full h-full flex flex-col items-center justify-center">
                <Num size={54} color={T.white}>{playerNumber}</Num>
                <Label size={9} color={T.accOnDark} tracking="0.3em" className="mt-2">НОМЕР</Label>
              </div>
            </Dark>
          </div>
        </Glass>
        </div>

        {/* Портрет — выступает над плашкой */}
        <div className="absolute z-20" style={{ left: PHOTO_X, top: 0 }}>
          <Portrait person={person} size={PHOTO} ring={6} accent={teamColor} />
        </div>
      </div>
    </Reveal>
  );
}

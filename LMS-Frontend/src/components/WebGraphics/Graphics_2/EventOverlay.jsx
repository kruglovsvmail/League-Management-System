// src/components/WebGraphics/Graphics_2/EventOverlay.jsx
//
// Гол / штраф — низкая широкая плашка по центру снизу. Игрок ВЫХОДИТ за верхнюю
// кромку, за ним разлетается россыпь осколков, номер набран жёлтым по правому
// краю. На голе осколки взрываются от фигуры.
import React from 'react';
import { getSafeUrl } from '../../../utils/graphicsHelpers';
import { getImageUrl } from '../../../utils/helpers';
import { Cut } from './Cut';
import { Card } from './Stage';
import { ShardField, ShardBurst, Halftone, Tri, Bar } from './Shards';
import { Big, Num, Cap, Tag } from './Type';
import { S, SHARD_PALETTE, GOAL_STRENGTH } from './theme';

const CARD_W = 1340;
const CARD_H = 296;
const PHOTO_W = 300;
const PHOTO_H = 466;
const PHOTO_X = 60;

export default function EventOverlay({ game, overlay }) {
  if (!overlay.data) return null;

  const isVisible = overlay.visible && (overlay.type === 'goal' || overlay.type === 'penalty');
  const isGoal = overlay.type === 'goal';

  const homeShort = game.home_short_name || game.home_team_name?.substring(0, 3).toUpperCase() || 'ХОЗ';
  const awayShort = game.away_short_name || game.away_team_name?.substring(0, 3).toUpperCase() || 'ГОС';

  const defaultPhoto = getImageUrl('default/user_default.webp');
  const playerPhoto = getSafeUrl(overlay.data?.primary_photo_url) || defaultPhoto;
  const teamLogo = getSafeUrl(overlay.data?.team_logo);

  const isHomeEvent = overlay.data?.team_id === game.home_team_id;
  const teamShort = isHomeEvent ? homeShort : awayShort;
  const accent = isGoal ? S.yellow : S.red;

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
  const periodLabel = overlay.data?.period
    ? (overlay.data.period === 'OT' ? 'ОВЕРТАЙМ' : overlay.data.period === 'SO' ? 'БУЛЛИТЫ' : `${overlay.data.period} ПЕРИОД`)
    : null;

  const assists = [overlay.data.assist1_last_name, overlay.data.assist2_last_name].filter(Boolean);

  return (
    <Cut isVisible={isVisible} variant="lift" className="absolute bottom-14 left-1/2 z-50">
      {/* Обёртка выше плашки: фигура выходит за её кромку и не должна обрезаться */}
      <div className="relative" style={{ width: CARD_W, height: PHOTO_H }}>

        {/* Россыпь за фигурой */}
        <ShardField
          count={20} seed={19} origin={[50, 100]} dir={-90} spread={130} reach={64} size={17}
          palette={SHARD_PALETTE.onCoal} opacity={0.85}
          className="pointer-events-none z-0"
          style={{ left: PHOTO_X - 110, top: 0, width: PHOTO_W + 220, height: PHOTO_H }}
        />

        {isGoal && (
          <ShardBurst
            size={520} seed={23} className="g2-burst z-20"
            style={{ left: PHOTO_X + PHOTO_W / 2, top: PHOTO_H - CARD_H, transform: 'translate(-50%,-50%)' }}
          />
        )}

        {/* ---------- ПЛАШКА ---------- */}
        <div className="absolute left-0 bottom-0 z-10" style={{ width: CARD_W }}>
          <Card style={{ width: CARD_W, height: CARD_H }} accent={accent} seed={17} shards={false}>
            {/* Номер жёлтым по правому краю */}
            <div className="absolute right-12 top-1/2 -translate-y-1/2 pointer-events-none z-0">
              <Num size={196} color={accent} style={{ opacity: 0.2 }}>{playerNumber}</Num>
            </div>

            <ShardField
              count={14} seed={29} origin={[104, 92]} dir={-146} spread={70} reach={64} size={20}
              palette={SHARD_PALETTE.onCoal} opacity={0.55}
              className="right-0 bottom-0 w-[34%] h-full pointer-events-none z-0"
            />

            <div
              className="absolute inset-0 flex flex-col justify-center g2-seq z-10"
              style={{ paddingLeft: PHOTO_X + PHOTO_W + 58, paddingRight: 220 }}
            >
              <div className="flex items-center gap-4 mb-4">
                <Tag bg={accent} color={isGoal ? S.coalDeep : S.white} size={16} className="px-5">
                  {isGoal ? 'ГОЛ' : 'ШТРАФ'}
                </Tag>

                {strengthLabel && (
                  <div className="px-3.5 py-2" style={{ border: `2px solid ${S.line}` }}>
                    <Cap size={11} color={S.ash} tracking="0.18em">{strengthLabel}</Cap>
                  </div>
                )}

                <div className="flex items-center gap-3 ml-1">
                  {teamLogo && (
                    <img src={teamLogo} alt="" className="w-8 h-8 object-contain" onError={(e) => { e.target.style.display = 'none'; }} />
                  )}
                  <Cap size={12} color={S.ash} tracking="0.24em">{teamShort}</Cap>
                  {periodLabel && (
                    <>
                      <Tri size={9} color={S.line} rotate={90} />
                      <Cap size={12} color={S.ash} tracking="0.24em">{periodLabel}</Cap>
                    </>
                  )}
                </div>
              </div>

              <div className="truncate">
                <Big size={76} color={S.white}>{overlay.data.primary_last_name}</Big>
              </div>

              <div className="mt-4">
                <Cap size={25} color={S.yellow} tracking="0.14em">{overlay.data.primary_first_name}</Cap>
              </div>

              <div className="flex items-center gap-5 mt-6">
                <Bar w={40} h={8} color={accent} />

                {isGoal ? (
                  assists.length > 0 ? (
                    <div className="flex items-baseline gap-4 min-w-0">
                      <Cap size={10} color={S.ash} tracking="0.34em">ПЕРЕДАЧИ</Cap>
                      <span className="font-black uppercase leading-none truncate" style={{ color: S.white, fontSize: 24, letterSpacing: '0.01em' }}>
                        {assists.join('   ·   ')}
                      </span>
                    </div>
                  ) : (
                    <Cap size={14} color={S.line} tracking="0.28em">БЕЗ АССИСТЕНТОВ</Cap>
                  )
                ) : (
                  <div className="flex items-center gap-5 min-w-0">
                    <div className="flex items-baseline gap-2 shrink-0">
                      <Num size={38} color={S.red}>{overlay.data.penalty_minutes}</Num>
                      <Cap size={14} color={S.red} tracking="0.2em">МИН</Cap>
                    </div>
                    <span className="font-black uppercase leading-none truncate" style={{ color: S.white, fontSize: 20, letterSpacing: '0.03em' }}>
                      {overlay.data.penalty_violation}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>

        {/* ---------- ФИГУРА ИГРОКА ---------- */}
        <div className="absolute bottom-0 z-30 pointer-events-none" style={{ left: PHOTO_X, width: PHOTO_W, height: PHOTO_H }}>
          <img
            key={overlay.data.id || overlay.data.primary_player_id}
            src={playerPhoto}
            alt=""
            className="w-full h-full object-cover object-top"
            style={{
              // Верх фигуры уходит в ничто — иначе фото читается как приклеенный прямоугольник
              WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.4) 10%, #000 28%)',
              maskImage: 'linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.4) 10%, #000 28%)',
              filter: 'contrast(1.08) drop-shadow(0 16px 26px rgba(0,0,0,0.7))',
            }}
            onError={(e) => { e.target.onerror = null; e.target.src = defaultPhoto; }}
          />
          <div className="absolute inset-0 overflow-hidden">
            <Halftone color="rgba(255,255,255,0.1)" cell={8} dot={1.2} fade="to top" opacity={0.6} />
          </div>
        </div>
      </div>
    </Cut>
  );
}

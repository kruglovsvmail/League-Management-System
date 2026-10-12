// src/components/WebGraphics/defaultGraphics/TeamRosterLinesOverlay.jsx
//
// Состав по звеньям — по ОДНОМУ звену на экран, как карточки звена в TR:
// крупное квадратное фото, под ним фамилия и имя. Тройка нападения сверху,
// пара защиты под ней — как стоят на льду. Слева эмблема, название и вратари.
//
// Листается само: lineSwitch секунд на звено (по умолчанию 3, настраивается в
// панели трансляции, когда выбран вид «По звеньям»). Сначала все звенья
// хозяев, потом гостей; игроки без звена — после звеньев своей команды.
// Страницы — rosterLinePages (broadcastConfig.js): по ним же автопилот
// панели считает, сколько держать плашку.
import React from 'react';
import { Crest, Photo, Kicker, FitText, usePager, Page } from './kit';
import { Stage, StageEmpty, BODY_H } from './Stage';
import { rosterLinePages, LINE_SWITCH_DEFAULT } from '../broadcastConfig';
import { C, NUM, ACCENT_FILL, teamColor, teamInk, rgba } from './theme';

const AMPLUA = { goalie: 'ВР', defense: 'З', forward: 'Н' };
const isTrue = v => v === true || v === 'true';

// Карточка как в TR: фото сверху, под ним фамилия и имя. Номер — плашкой
// цвета команды в углу фото, амплуа — в другом углу.
function Card({ player, slot, color, photo = 210 }) {
  const w = photo + 28;
  if (!player) {
    return (
      <div style={{ width: w, height: photo + 104, borderRadius: 26, border: `2px dashed ${C.divider}`, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', gap: 10, color: C.subtle }}>
        <span style={{ fontFamily: NUM, fontSize: 34, fontWeight: 800 }}>{slot}</span>
        <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: '0.2em' }}>СВОБОДНО</span>
      </div>
    );
  }
  const captain = isTrue(player.is_captain);
  const assistant = isTrue(player.is_assistant);
  return (
    <div style={{ width: w, padding: 14, borderRadius: 26, background: 'rgba(0,0,0,.32)', boxShadow: `inset 0 0 0 1px ${C.rim}`, minWidth: 0 }}>
      <div style={{ position: 'relative', width: photo, height: photo }}>
        <Photo url={player.avatar_url} style={{ width: photo, height: photo, borderRadius: 20 }} />
        <div style={{ position: 'absolute', inset: 0, borderRadius: 20, background: `linear-gradient(180deg, transparent 60%, ${rgba(color, 0.35)} 100%)` }} />
        {/* Номер — плашкой цвета команды */}
        <span className="g2-num" style={{ position: 'absolute', left: 10, top: 10, minWidth: 52, height: 44, padding: '0 10px', borderRadius: 12,
                                           display: 'flex', alignItems: 'center', justifyContent: 'center',
                                           background: `linear-gradient(180deg, #FFFFFF33 0%, #FFFFFF00 100%), ${color}`,
                                           boxShadow: '0 6px 16px -4px rgba(0,0,0,.6)', fontSize: 28, fontWeight: 800, color: '#fff',
                                           textShadow: '0 1px 4px rgba(0,0,0,.4)' }}>
          {player.jersey_number ?? '—'}
        </span>
        <div style={{ position: 'absolute', right: 10, top: 10, display: 'flex', gap: 6 }}>
          {(captain || assistant) && (
            <span style={{ height: 30, minWidth: 30, borderRadius: 9, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800,
                           background: captain ? ACCENT_FILL : 'rgba(0,0,0,.55)', boxShadow: captain ? 'none' : `inset 0 0 0 2px ${C.accentSoft}`,
                           color: captain ? '#fff' : C.accentSoft }}>
              {captain ? 'К' : 'А'}
            </span>
          )}
          <span style={{ height: 30, padding: '0 9px', borderRadius: 9, display: 'flex', alignItems: 'center', background: 'rgba(0,0,0,.55)',
                         fontSize: 15, fontWeight: 800, letterSpacing: '0.08em', color: C.main }}>
            {slot || AMPLUA[player.position] || ''}
          </span>
        </div>
      </div>
      <FitText min={0.55} style={{ marginTop: 14, fontSize: 28, fontWeight: 800, textTransform: 'uppercase', color: C.text, lineHeight: 1.1 }}>{player.last_name}</FitText>
      <div style={{ marginTop: 4, fontSize: 21, fontWeight: 600, color: C.main, lineHeight: 1.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {player.first_name}
      </div>
    </div>
  );
}

// Вратари слева — компактно: фото, номер, фамилия и имя.
function Goalie({ p, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 12, borderRadius: 20, background: 'rgba(0,0,0,.3)', boxShadow: `inset 0 0 0 1px ${C.rim}` }}>
      <Photo url={p.avatar_url} style={{ width: 76, height: 76, borderRadius: 16, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <span className="g2-num" style={{ fontSize: 26, fontWeight: 800, color }}>{p.jersey_number ?? '—'}</span>
        <FitText min={0.6} style={{ fontSize: 22, fontWeight: 800, textTransform: 'uppercase', color: C.text, lineHeight: 1.15 }}>{p.last_name}</FitText>
        <div style={{ fontSize: 17, fontWeight: 600, color: C.main, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.first_name}</div>
      </div>
    </div>
  );
}

export default function TeamRosterLinesOverlay({ game, overlay, broadcast }) {
  const visible = overlay.visible && overlay.type === 'team_roster' && overlay.data?.rosterView === 'lines';
  const pages = rosterLinePages(game, broadcast?.data);
  const page = usePager(visible, pages.length, overlay.data?.lineSwitch ?? LINE_SWITCH_DEFAULT, game.id);
  const cur = pages[page];
  const side = cur?.side || 'home';
  const color = teamColor(game, side);
  const ink = teamInk(game, side);

  return (
    <Stage game={game} visible={visible} title="Состав по звеньям" kicker={side === 'home' ? 'Хозяева' : 'Гости'} glow={[color, color]}
           page={page} pages={pages.length}>
      {!cur ? <StageEmpty loading={broadcast?.loading} error={broadcast?.error} /> : (
        <div style={{ display: 'flex', height: BODY_H }}>
          {/* Команда и вратари — меняются, только когда меняется команда */}
          <aside style={{ width: 420, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '34px 36px', borderRight: `1px solid ${C.divider}` }}>
            <Page pageKey={side} style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%' }}>
              <Crest url={game[`${side}_team_logo`]} size={170} />
              <FitText align="center" min={0.6} style={{ width: '100%', marginTop: 22, fontSize: 36, fontWeight: 800, textTransform: 'uppercase', lineHeight: 1.05, color: C.text }}>
                {game[`${side}_team_name`]}
              </FitText>
              <div style={{ width: 90, height: 6, borderRadius: 3, marginTop: 14, background: color }} />
              {cur.goalies.length > 0 && (
                <div style={{ width: '100%', marginTop: 'auto' }}>
                  <Kicker size={16} color={C.accentSoft} style={{ marginBottom: 12 }}>Вратари</Kicker>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {cur.goalies.slice(0, 3).map(p => <Goalie key={p.player_id} p={p} color={ink} />)}
                  </div>
                </div>
              )}
            </Page>
          </aside>

          <main style={{ flex: 1, minWidth: 0, padding: '26px 40px 30px', display: 'flex', flexDirection: 'column' }}>
            <Page pageKey={`${game.id}:${page}`} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              {/* Заголовок: номер звена и «какое из скольких» */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, height: 56, flexShrink: 0 }}>
                {cur.line ? (
                  <>
                    <span className="g2-num" style={{ height: 52, minWidth: 52, padding: '0 12px', borderRadius: 14, background: ACCENT_FILL, display: 'flex',
                                                       alignItems: 'center', justifyContent: 'center', fontSize: 32, fontWeight: 800, color: '#fff' }}>
                      {cur.line.number}
                    </span>
                    <span className="g2-loud" style={{ fontSize: 30, color: C.text }}>ЗВЕНО</span>
                  </>
                ) : (
                  <span className="g2-loud" style={{ fontSize: 28, color: C.text }}>{cur.lineCount ? 'БЕЗ РАСПРЕДЕЛЕНИЯ' : 'РАССТАНОВКА НЕ ЗАДАНА'}</span>
                )}
                {cur.lineCount > 1 && (
                  <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {Array.from({ length: cur.lineCount }).map((_, i) => (
                      <span key={i} className="g2-num" style={{ width: 40, height: 34, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                               fontSize: 18, fontWeight: 800,
                                                               background: i === cur.lineIndex ? rgba(color, 0.9) : 'rgba(255,255,255,.05)',
                                                               color: i === cur.lineIndex ? '#fff' : C.subtle,
                                                               boxShadow: i === cur.lineIndex ? `0 6px 16px -6px ${rgba(color, 0.9)}` : `inset 0 0 0 1px ${C.rim}` }}>
                        {i + 1}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {cur.line ? (
                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 30 }}>
                    {cur.line.slots.slice(0, 3).map(s => <Card key={s.key} player={s.player} slot={s.label} color={color} />)}
                  </div>
                  <div style={{ display: 'flex', gap: 30 }}>
                    {cur.line.slots.slice(3).map(s => <Card key={s.key} player={s.player} slot={s.label} color={color} />)}
                  </div>
                </div>
              ) : cur.extras.length ? (
                <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'repeat(5, auto)', justifyContent: 'center', alignContent: 'center', gap: 20 }}>
                  {cur.extras.map(p => <Card key={p.player_id} player={p} color={color} photo={150} />)}
                </div>
              ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 800, letterSpacing: '0.12em', color: C.subtle, textTransform: 'uppercase' }}>
                  Полевые игроки не заявлены
                </div>
              )}
            </Page>
          </main>
        </div>
      )}
    </Stage>
  );
}

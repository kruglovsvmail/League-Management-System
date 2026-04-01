import React, { Suspense, useMemo, useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useWebGraphics } from '../components/WebGraphics/useWebGraphics';

const scoreboards = import.meta.glob('../components/WebGraphics/*/Scoreboard.jsx');
const eventOverlays = import.meta.glob('../components/WebGraphics/*/EventOverlay.jsx');
const arenaOverlays = import.meta.glob('../components/WebGraphics/*/ArenaOverlay.jsx');
const preMatchOverlays = import.meta.glob('../components/WebGraphics/*/PreMatchOverlay.jsx');
const teamLeadersOverlays = import.meta.glob('../components/WebGraphics/*/TeamLeadersOverlay.jsx');
const teamRosterOverlays = import.meta.glob('../components/WebGraphics/*/TeamRosterOverlay.jsx');
const intermissionOverlays = import.meta.glob('../components/WebGraphics/*/IntermissionOverlay.jsx');
const commentatorOverlays = import.meta.glob('../components/WebGraphics/*/CommentatorOverlay.jsx'); 
const refereesOverlays = import.meta.glob('../components/WebGraphics/*/RefereesOverlay.jsx'); 

export function WebGraphics() {
  const { gameId } = useParams();
  
  const { 
    game, events, timerSeconds, currentPeriod, isTimerRunning, 
    activePenalties, periodLength, otLength, soLength, overlay,
    isScoreboardVisible
  } = useWebGraphics(gameId);

  const [scale, setScale] = useState(1);

  useEffect(() => {
    const handleResize = () => {
      const scaleX = window.innerWidth / 1920;
      const scaleY = window.innerHeight / 1080;
      setScale(Math.min(scaleX, scaleY));
    };

    window.addEventListener('resize', handleResize);
    handleResize(); 

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const ScoreboardComponent = useMemo(() => {
    if (!game) return null;
    const leagueId = game.league_id;
    const targetPath = `../components/WebGraphics/Graphics_${leagueId}/Scoreboard.jsx`;
    const defaultPath = '../components/WebGraphics/defaultGraphics/Scoreboard.jsx';
    const importFn = scoreboards[targetPath] || scoreboards[defaultPath];
    return importFn ? React.lazy(importFn) : () => null;
  }, [game?.league_id]);

  const EventOverlayComponent = useMemo(() => {
    if (!game) return null;
    const leagueId = game.league_id;
    const targetPath = `../components/WebGraphics/Graphics_${leagueId}/EventOverlay.jsx`;
    const defaultPath = '../components/WebGraphics/defaultGraphics/EventOverlay.jsx';
    const importFn = eventOverlays[targetPath] || eventOverlays[defaultPath];
    return importFn ? React.lazy(importFn) : () => null;
  }, [game?.league_id]);

  const ArenaOverlayComponent = useMemo(() => {
    if (!game) return null;
    const leagueId = game.league_id;
    const targetPath = `../components/WebGraphics/Graphics_${leagueId}/ArenaOverlay.jsx`;
    const defaultPath = '../components/WebGraphics/defaultGraphics/ArenaOverlay.jsx';
    const importFn = arenaOverlays[targetPath] || arenaOverlays[defaultPath];
    return importFn ? React.lazy(importFn) : () => null;
  }, [game?.league_id]);

  const PreMatchOverlayComponent = useMemo(() => {
    if (!game) return null;
    const leagueId = game.league_id;
    const targetPath = `../components/WebGraphics/Graphics_${leagueId}/PreMatchOverlay.jsx`;
    const defaultPath = '../components/WebGraphics/defaultGraphics/PreMatchOverlay.jsx';
    const importFn = preMatchOverlays[targetPath] || preMatchOverlays[defaultPath];
    return importFn ? React.lazy(importFn) : () => null;
  }, [game?.league_id]);

  const TeamLeadersOverlayComponent = useMemo(() => {
    if (!game) return null;
    const leagueId = game.league_id;
    const targetPath = `../components/WebGraphics/Graphics_${leagueId}/TeamLeadersOverlay.jsx`;
    const defaultPath = '../components/WebGraphics/defaultGraphics/TeamLeadersOverlay.jsx';
    const importFn = teamLeadersOverlays[targetPath] || teamLeadersOverlays[defaultPath];
    return importFn ? React.lazy(importFn) : () => null;
  }, [game?.league_id]);

  const TeamRosterOverlayComponent = useMemo(() => {
    if (!game) return null;
    const leagueId = game.league_id;
    const targetPath = `../components/WebGraphics/Graphics_${leagueId}/TeamRosterOverlay.jsx`;
    const defaultPath = '../components/WebGraphics/defaultGraphics/TeamRosterOverlay.jsx';
    const importFn = teamRosterOverlays[targetPath] || teamRosterOverlays[defaultPath];
    return importFn ? React.lazy(importFn) : () => null;
  }, [game?.league_id]);

  const IntermissionOverlayComponent = useMemo(() => {
    if (!game) return null;
    const leagueId = game.league_id;
    const targetPath = `../components/WebGraphics/Graphics_${leagueId}/IntermissionOverlay.jsx`;
    const defaultPath = '../components/WebGraphics/defaultGraphics/IntermissionOverlay.jsx';
    const importFn = intermissionOverlays[targetPath] || intermissionOverlays[defaultPath];
    return importFn ? React.lazy(importFn) : () => null;
  }, [game?.league_id]);

  const CommentatorOverlayComponent = useMemo(() => {
    if (!game) return null;
    const leagueId = game.league_id;
    const targetPath = `../components/WebGraphics/Graphics_${leagueId}/CommentatorOverlay.jsx`;
    const defaultPath = '../components/WebGraphics/defaultGraphics/CommentatorOverlay.jsx';
    const importFn = commentatorOverlays[targetPath] || commentatorOverlays[defaultPath];
    return importFn ? React.lazy(importFn) : () => null;
  }, [game?.league_id]);

  const RefereesOverlayComponent = useMemo(() => {
    if (!game) return null;
    const leagueId = game.league_id;
    const targetPath = `../components/WebGraphics/Graphics_${leagueId}/RefereesOverlay.jsx`;
    const defaultPath = '../components/WebGraphics/defaultGraphics/RefereesOverlay.jsx';
    const importFn = refereesOverlays[targetPath] || refereesOverlays[defaultPath];
    return importFn ? React.lazy(importFn) : () => null;
  }, [game?.league_id]);

  if (!game) return null;

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none bg-transparent">
      <div 
        className="absolute top-0 left-0 w-[1920px] h-[1080px] origin-top-left font-sans"
        style={{ transform: `scale(${scale})` }}
      >
        <Suspense fallback={null}>
          
          {ScoreboardComponent && (
            <ScoreboardComponent 
              game={game}
              events={events}
              soLength={soLength}
              timerSeconds={timerSeconds}
              currentPeriod={currentPeriod}
              isTimerRunning={isTimerRunning}
              activePenalties={activePenalties}
              periodLength={periodLength}
              otLength={otLength}
              overlay={overlay} 
              isScoreboardVisible={isScoreboardVisible}
            />
          )}
          
          {EventOverlayComponent && <EventOverlayComponent game={game} overlay={overlay} />}
          {ArenaOverlayComponent && <ArenaOverlayComponent game={game} overlay={overlay} />}
          {PreMatchOverlayComponent && <PreMatchOverlayComponent game={game} overlay={overlay} />}
          {TeamLeadersOverlayComponent && <TeamLeadersOverlayComponent game={game} overlay={overlay} />}
          {TeamRosterOverlayComponent && <TeamRosterOverlayComponent game={game} overlay={overlay} />}
          {CommentatorOverlayComponent && <CommentatorOverlayComponent game={game} overlay={overlay} />}
          {RefereesOverlayComponent && <RefereesOverlayComponent game={game} overlay={overlay} />}
          
          {/* Плашке перерыва нужно знать текущее время, чтобы выводить "Счет после 1 периода" */}
          {IntermissionOverlayComponent && <IntermissionOverlayComponent game={game} overlay={overlay} timerSeconds={timerSeconds} periodLength={periodLength} />}
          
        </Suspense>
      </div>
    </div>
  );
}
// LMS-Backend/utils/periodLimits.js
// Портировано 1:1 из LMS-Frontend/src/components/GameLiveDesk/GameDeskShared.jsx (getPeriodLimits)

export const getPeriodLimits = (period, pLen, otLen, pCount = 3) => {
    const p = parseInt(pLen, 10) || 20;
    const o = isNaN(parseInt(otLen, 10)) ? 5 : parseInt(otLen, 10);
    const c = parseInt(pCount, 10) || 3;

    const regTime = p * c * 60;
    const soTime = regTime + (o * 60);

    if (period === 'OT') return { start: regTime, end: soTime };
    if (period === 'SO') return { start: soTime, end: soTime };

    const periodNum = parseInt(period, 10);
    if (!isNaN(periodNum) && periodNum >= 1 && periodNum <= c) {
        return { start: (periodNum - 1) * p * 60, end: periodNum * p * 60 };
    }

    return { start: 0, end: 0 };
};

// Конец матча на игровых часах — портировано из GameDeskShared.jsx (getMatchEndSecs):
// конец основного времени; если дошли до овертайма — его конец, а если овертайм
// закончился голом — время этого гола. В протоколе удалению, которое к нему не
// истекло, окончание не печатается (ProtocolPDFController.js).
export const getMatchEndSecs = ({ events = [], currentPeriod, endType, periodLength, otLength, periodsCount }) => {
    const regEnd = getPeriodLimits(String(parseInt(periodsCount, 10) || 3), periodLength, otLength, periodsCount).end;
    const ot = getPeriodLimits('OT', periodLength, otLength, periodsCount);
    const hasOt = ot.end > ot.start;
    const reachedOt = hasOt && (
        currentPeriod === 'OT' || currentPeriod === 'SO' || endType === 'ot' || endType === 'so'
        || events.some(e => e.period === 'OT' || e.period === 'SO')
    );
    if (!reachedOt) return regEnd;
    // Овертайм играется до гола: забитый в нём гол и есть конец матча
    const otGoal = events
        .filter(e => e.event_type === 'goal' && e.period === 'OT')
        .map(e => parseInt(e.time_seconds, 10))
        .filter(t => !isNaN(t))
        .sort((a, b) => a - b)[0];
    return otGoal ?? ot.end;
};

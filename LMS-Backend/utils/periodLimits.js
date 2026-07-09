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

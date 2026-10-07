export const hasProtocolBackContent = (data) => {
    const hasText = (value) => value != null && String(value).trim() !== '';
    const notes = data.notes || {};
    return (data.shootout || []).length > 0
        || (data.playerChecks || []).some(row => Object.values(row).some(hasText))
        || [notes.referee, notes.inspector, notes.medical, notes.protestText,
            notes.protestHome?.filed, notes.protestAway?.filed].some(hasText);
};

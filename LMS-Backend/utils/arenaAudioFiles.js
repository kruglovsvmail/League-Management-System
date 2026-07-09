// LMS-Backend/utils/arenaAudioFiles.js
// Статичные PA-файлы диктора арены (сирена, предупреждения) — лежат в audio/league-{leagueId}/,
// НЕ в arena-tts (та папка только для сгенерированных TTS-фраз голов/составов).
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import s3 from '../config/s3.js';

export const ARENA_STATIC_AUDIO_FILES = [
    'end.mp3',
    'left-2min.mp3',
    'left-1min-1.mp3',
    'left-1min-2.mp3',
    'left-1min-3.mp3',
];

export async function arenaAudioFileExists(leagueId, filename) {
    try {
        await s3.send(new HeadObjectCommand({
            Bucket: 'hockeyeco-uploads',
            Key: `audio/league-${leagueId}/${filename}`
        }));
        return true;
    } catch (e) {
        return false;
    }
}

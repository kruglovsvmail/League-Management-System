// LMS-Backend/utils/arenaAudioFiles.js
// Статичные PA-файлы диктора арены (сирена, предупреждения, бип) — лежат в audio/league-{leagueId}/,
// НЕ в arena-tts (та папка только для сгенерированных TTS-фраз голов/составов).
// Загружает их глобальный администратор: Команды → Лиги → «Диктор арены».
import { HeadObjectCommand } from '@aws-sdk/client-s3';
import s3 from '../config/s3.js';

export const ARENA_AUDIO_BUCKET = 'hockeyeco-uploads';

// Предупреждения: за минуту до конца каждого периода, кроме последнего (left-1min-N.mp3),
// и за две до конца последнего (left-2min.mp3). Бип — страховка на случай, когда голоса
// не будет, и сигнал по сценарию лиги (leagues.arena_beep_schedule).
export const ARENA_STATIC_AUDIO_FILES = [
    'end.mp3',
    'left-1min-1.mp3',
    'left-1min-2.mp3',
    'left-2min.mp3',
    'beep.mp3',
];

export const arenaAudioKey = (leagueId, filename) => `audio/league-${leagueId}/${filename}`;

export async function arenaAudioFileExists(leagueId, filename) {
    try {
        await s3.send(new HeadObjectCommand({
            Bucket: ARENA_AUDIO_BUCKET,
            Key: arenaAudioKey(leagueId, filename)
        }));
        return true;
    } catch (e) {
        return false;
    }
}

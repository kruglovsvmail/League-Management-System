/**
 * TTS — КОММЕНТАТОР (панель трансляции)
 * Голос: madirus | Эхо: 10% | S3-prefix: audio/league-{leagueId}/broadcast-tts/
 */

import https from 'https';
import querystring from 'querystring';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import ffmpegFluent from 'fluent-ffmpeg';
import pool from '../config/db.js';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import s3 from '../config/s3.js';
import { buildAnnouncementText, buildBroadcastEventText } from './ttsShared.js';
import { getLeagueIdForGame } from '../utils/leagueLookup.js';

const _require = createRequire(import.meta.url);
ffmpegFluent.setFfmpegPath(_require('ffmpeg-static'));

const YC_API_KEY   = process.env.YC_TTS_API_KEY;
const YC_FOLDER_ID = process.env.YC_TTS_FOLDER_ID;

const VOICE        = 'madirus';
const SPEED_ROSTER = '1.3';
const SPEED_EVENT  = '1.1';
const ECHO_DECAY   = 0.15;   // 10% эхо
const ECHO_DELAY   = 55;    // мс

// ── Синтез через Yandex SpeechKit ───────────────────────────────────────────

function synthesizeYandex(text, speed) {
    return new Promise((resolve, reject) => {
        const postData = querystring.stringify({
            text, lang: 'ru-RU', voice: VOICE, speed,
            format: 'oggopus', folderId: YC_FOLDER_ID
        });

        const req = https.request({
            hostname: 'tts.api.cloud.yandex.net',
            path: '/speech/v1/tts:synthesize',
            method: 'POST',
            headers: {
                'Authorization': `Api-Key ${YC_API_KEY}`,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData)
            }
        }, (res) => {
            const chunks = [];
            res.on('data', d => chunks.push(d));
            res.on('end', () => {
                const buf = Buffer.concat(chunks);
                if (res.statusCode === 200) resolve(buf);
                else reject(new Error(`Yandex TTS ${res.statusCode}: ${buf.toString()}`));
            });
        });

        req.on('error', reject);
        req.setTimeout(30000, () => { req.destroy(); reject(new Error('Yandex TTS timeout')); });
        req.write(postData);
        req.end();
    });
}

// ── Добавление эха через FFmpeg ──────────────────────────────────────────────

function addEcho(inputBuf) {
    return new Promise((resolve, reject) => {
        const tmpIn  = path.join(os.tmpdir(), `broadcast_in_${Date.now()}.ogg`);
        const tmpOut = path.join(os.tmpdir(), `broadcast_out_${Date.now()}.ogg`);

        fs.writeFileSync(tmpIn, inputBuf);

        ffmpegFluent(tmpIn)
            .audioFilters(`aecho=0.8:0.9:${ECHO_DELAY}:${ECHO_DECAY}`)
            .audioCodec('libopus')
            .format('ogg')
            .on('end', () => {
                const result = fs.readFileSync(tmpOut);
                try { fs.unlinkSync(tmpIn); fs.unlinkSync(tmpOut); } catch {}
                resolve(result);
            })
            .on('error', (err) => {
                try { fs.unlinkSync(tmpIn); fs.unlinkSync(tmpOut); } catch {}
                reject(err);
            })
            .save(tmpOut);
    });
}

// ── Синтез + эхо + загрузка в S3 ────────────────────────────────────────────

async function generateAndUpload(text, s3Key, speed) {
    const raw   = await synthesizeYandex(text, speed);
    const audio = await addEcho(raw);

    await s3.send(new PutObjectCommand({
        Bucket: 'hockeyeco-uploads',
        Key: s3Key,
        Body: audio,
        ContentType: 'audio/ogg'
    }));

    return `https://s3.twcstorage.ru/hockeyeco-uploads/${s3Key}`;
}

// ── Озвучка составов команд ──────────────────────────────────────────────────

export const broadcastRosterAnnouncement = async (req, res) => {
    try {
        const { gameId } = req.params;

        const gameRes = await pool.query(`
            SELECT g.id, g.home_team_id, g.away_team_id,
                   ht.name as home_team_name, ht.pronunciation as home_team_pronunciation,
                   at.name as away_team_name, at.pronunciation as away_team_pronunciation
            FROM games g
            JOIN teams ht ON g.home_team_id = ht.id
            JOIN teams at ON g.away_team_id = at.id
            WHERE g.id = $1
        `, [gameId]);

        if (gameRes.rows.length === 0)
            return res.status(404).json({ success: false, error: 'Матч не найден' });

        const game = gameRes.rows[0];

        const rostersRes = await pool.query(`
            SELECT gr.team_id, gr.jersey_number, gr.position_in_line, gr.is_captain, gr.is_assistant,
                   u.first_name, u.last_name, u.pronunciation
            FROM game_rosters gr
            JOIN users u ON gr.player_id = u.id
            WHERE gr.game_id = $1 AND gr.is_in_lineup = true
            ORDER BY gr.jersey_number ASC
        `, [gameId]);

        if (rostersRes.rows.length === 0)
            return res.status(400).json({ success: false, error: 'Составы команд не заполнены' });

        const homeRoster = rostersRes.rows.filter(p => p.team_id === game.home_team_id);
        const awayRoster = rostersRes.rows.filter(p => p.team_id === game.away_team_id);

        const leagueId = (await getLeagueIdForGame(gameId)) || 'default';
        const text  = buildAnnouncementText(game, homeRoster, awayRoster);
        const s3Key = `audio/league-${leagueId}/broadcast-tts/game-${gameId}-roster.ogg`;
        const url   = await generateAndUpload(text, s3Key, SPEED_ROSTER);

        res.json({ success: true, url });
    } catch (err) {
        console.error('[BroadcastTTS] roster error:', err);
        res.status(500).json({ success: false, error: 'Ошибка генерации аудио' });
    }
};

// ── Озвучка события (гол / штраф) ────────────────────────────────────────────
// Переиспользуется и REST-роутом (панель заранее генерирует TTS через pregenerateTts),
// и серверным модулем broadcastAnnouncer.js (сам решает когда показать/озвучить событие).

export async function generateBroadcastEventAudio({ gameId, leagueId, eventId, eventPayload }) {
    const text = buildBroadcastEventText(eventPayload);
    if (text === null) return null;

    const league = leagueId || 'default';
    const id     = eventId || 'latest';
    const s3Key  = `audio/league-${league}/broadcast-tts/game-${gameId}-event-${id}.ogg`;
    const url    = await generateAndUpload(text, s3Key, SPEED_EVENT);

    return `${url}?t=${Date.now()}`;
}

export const broadcastEventAnnouncement = async (req, res) => {
    try {
        const { gameId } = req.params;
        const { event_id } = req.body;

        const leagueId = (await getLeagueIdForGame(gameId)) || 'default';
        const url = await generateBroadcastEventAudio({ gameId, leagueId, eventId: event_id, eventPayload: req.body });

        if (url === null)
            return res.status(400).json({ success: false, error: 'Неизвестный тип события' });

        res.json({ success: true, url });
    } catch (err) {
        console.error('[BroadcastTTS] event error:', err);
        res.status(500).json({ success: false, error: 'Ошибка генерации аудио' });
    }
};

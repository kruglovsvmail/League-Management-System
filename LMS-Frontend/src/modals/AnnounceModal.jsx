import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import dayjs from 'dayjs';
import { Modal } from './Modal';
import { ConfirmModal } from './ConfirmModal';
import { Button } from '../ui/Button';
import { Checkbox } from '../ui/Checkbox';
import { Icon } from '../ui/Icon';
import { Loader } from '../ui/Loader';
import { getToken, getPlayoffStageDisplayLabel } from '../utils/helpers';

// Анонс матчей: картинка для соцсетей из расписания дивизиона.
//
// Рисует сервер (LMS-Backend/src/announces/, шаблон по лиге). Превью — тот же HTML,
// что сервер потом снимает в PNG, поэтому в окне видно ровно то, что скачается.
// Матчей больше, чем помещается на картинку, — сервер делит их на несколько.
//
// Фон лиги можно сменить прямо здесь (право ANNOUNCE_BACKGROUND_EDIT): он один на все
// анонсы лиги, а прежний перезаписывается насовсем — перед загрузкой об этом спрашиваем.

const PREVIEW_WIDTH = 240;
const BG_MAX_MB = 10;
const BG_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Тур = круг + номер. «Тур 2» есть и в первом круге, и во втором — поэтому ключ из
// этапа, его названия и номера (в регулярке series_number — тур, в плей-офф — матч серии).
const groupKey = (g) => [g.stage_type, g.stage_label || '', g.playoff_match_type || '', g.series_number || ''].join('|');

const groupLabel = (g) => {
    if (g.stage_type === 'playoff') {
        if (g.playoff_match_type) return getPlayoffStageDisplayLabel(g.stage_label, g.playoff_match_type);
        return g.series_number ? `${g.stage_label || 'Плей-офф'} · Матч ${g.series_number}` : (g.stage_label || 'Плей-офф');
    }
    const stage = g.stage_label || 'Регулярка';
    return g.series_number ? `${stage} · Тур ${g.series_number}` : `${stage} · без тура`;
};

const gameDateLabel = (g) => (g.game_date
    ? dayjs.utc(g.game_date).tz(g.arena_timezone || 'UTC').format('DD.MM, dd · HH:mm')
    : 'Дата не назначена');

const byDate = (a, b) => {
    if (!a.game_date && !b.game_date) return a.id - b.id;
    if (!a.game_date) return 1;
    if (!b.game_date) return -1;
    return new Date(a.game_date) - new Date(b.game_date);
};

const dataUrlToBlob = (dataUrl) => {
    const [head, body] = dataUrl.split(',');
    const mime = head.match(/data:(.*?);/)?.[1] || 'image/png';
    const bin = atob(body);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: mime });
};

const fileName = (i, total) => (total > 1 ? `Анонс матчей — ${i + 1} из ${total}.png` : 'Анонс матчей.png');

export function AnnounceModal({ isOpen, onClose, divisionId, leagueId, canEditBackground, games }) {
    const [showFinished, setShowFinished] = useState(false);
    const [selectedIds, setSelectedIds] = useState([]);
    const [preview, setPreview] = useState(null);
    const [isPreviewLoading, setIsPreviewLoading] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    // Сообщение внутри окна: тосты страницы лежат слоем ниже модалки и были бы не видны
    const [notice, setNotice] = useState(null); // { type: 'error' | 'info', text }
    // Фон: выбранный файл ждёт подтверждения; bgVersion перерисовывает превью после замены
    const [pendingBackground, setPendingBackground] = useState(null);
    const [isBackgroundUploading, setIsBackgroundUploading] = useState(false);
    const [bgVersion, setBgVersion] = useState(0);
    const bgInputRef = useRef(null);
    // Готовые PNG для текущего выбора и фона: повторное «Скачать» не рисует заново
    const renderedRef = useRef({ key: null, images: null });

    // В анонс годятся матчи с обеими командами; отменённые — никогда, сыгранные — по галочке.
    const eligible = useMemo(() => (games || [])
        .filter(g => g.home_team_id && g.away_team_id && g.status !== 'cancelled')
        .sort(byDate), [games]);

    const visible = useMemo(
        () => eligible.filter(g => showFinished || g.status !== 'finished'),
        [eligible, showFinished]
    );

    // Выбор в порядке расписания и только среди видимых: скрытые галочкой сыгранные
    // матчи из анонса выпадают.
    const selection = useMemo(
        () => visible.filter(g => selectedIds.includes(g.id)).map(g => g.id),
        [visible, selectedIds]
    );
    const selectionKey = selection.join(',');
    const renderKey = `${selectionKey}|${bgVersion}`;

    // При открытии сразу отмечаем матчи ближайшего тура. Если впереди матчей нет —
    // включаем сыгранные и берём последний тур: анонс прошедшего тура тоже бывает нужен.
    useEffect(() => {
        if (!isOpen) return;
        const upcoming = eligible.filter(g => g.status !== 'finished');
        const anchor = upcoming[0] || eligible[eligible.length - 1];
        setShowFinished(upcoming.length === 0);
        setSelectedIds(anchor ? eligible.filter(g => groupKey(g) === groupKey(anchor)).map(g => g.id) : []);
        setPreview(null);
        setIsPreviewLoading(false);
        setNotice(null);
        setPendingBackground(null);
        renderedRef.current = { key: null, images: null };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen]);

    // Превью перерисовывается на каждое изменение выбора — с небольшой задержкой,
    // чтобы серия кликов по галочкам не превращалась в серию запросов.
    useEffect(() => {
        if (!isOpen || !divisionId) return;
        if (selection.length === 0) {
            setPreview(null);
            return;
        }
        const controller = new AbortController();
        const timer = setTimeout(async () => {
            setIsPreviewLoading(true);
            try {
                const res = await fetch(`${import.meta.env.VITE_API_URL}/api/divisions/${divisionId}/announce/preview`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
                    body: JSON.stringify({ gameIds: selection }),
                    signal: controller.signal,
                });
                const data = await res.json();
                if (data.success) setPreview(data);
                else setNotice({ type: 'error', text: data.error || 'Не удалось собрать анонс' });
            } catch (err) {
                if (err.name !== 'AbortError') setNotice({ type: 'error', text: 'Сбой загрузки превью' });
            } finally {
                if (!controller.signal.aborted) setIsPreviewLoading(false);
            }
        }, 350);
        return () => { clearTimeout(timer); controller.abort(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, divisionId, renderKey]);

    const toggleGame = (id) => setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]));

    const renderImages = async () => {
        if (renderedRef.current.key === renderKey && renderedRef.current.images) return renderedRef.current.images;
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/divisions/${divisionId}/announce/render`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` },
            body: JSON.stringify({ gameIds: selection }),
        });
        const data = await res.json();
        if (!data.success) throw new Error(data.error || 'Не удалось сгенерировать картинку');
        renderedRef.current = { key: renderKey, images: data.images };
        return data.images;
    };

    const handleDownload = async () => {
        setIsDownloading(true);
        setNotice(null);
        try {
            const images = await renderImages();
            for (let i = 0; i < images.length; i++) {
                const url = URL.createObjectURL(dataUrlToBlob(images[i]));
                const a = document.createElement('a');
                a.href = url;
                a.download = fileName(i, images.length);
                document.body.appendChild(a);
                a.click();
                a.remove();
                setTimeout(() => URL.revokeObjectURL(url), 10000);
                // Пауза между файлами: подряд без неё браузер скачивает только первый
                if (i < images.length - 1) await new Promise(r => setTimeout(r, 400));
            }
        } catch (err) {
            setNotice({ type: 'error', text: err.message || 'Сбой генерации картинки' });
        } finally {
            setIsDownloading(false);
        }
    };

    // Сначала файл, потом подтверждение: человек видит предупреждение уже про
    // конкретную замену, и после «Отмена» ничего не меняется.
    const handleBackgroundPicked = (file) => {
        if (!BG_TYPES.includes(file.type)) {
            setNotice({ type: 'error', text: 'Для фона нужна картинка JPG, PNG или WebP' });
            return;
        }
        if (file.size > BG_MAX_MB * 1024 * 1024) {
            setNotice({ type: 'error', text: `Фон должен быть не больше ${BG_MAX_MB} МБ` });
            return;
        }
        setNotice(null);
        setPendingBackground(file);
    };

    const handleBackgroundUpload = async () => {
        if (!pendingBackground) return;
        setIsBackgroundUploading(true);
        try {
            const form = new FormData();
            form.append('file', pendingBackground);
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/leagues/${leagueId}/announce-background`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${getToken()}` },
                body: form,
            });
            const data = await res.json();
            if (data.success) {
                setBgVersion(v => v + 1);
                setNotice({ type: 'info', text: 'Фон обновлён — теперь он во всех анонсах лиги' });
            } else {
                setNotice({ type: 'error', text: data.error || 'Не удалось загрузить фон' });
            }
        } catch (err) {
            setNotice({ type: 'error', text: 'Не удалось загрузить фон' });
        } finally {
            setIsBackgroundUploading(false);
            setPendingBackground(null);
        }
    };

    const scale = PREVIEW_WIDTH / (preview?.width || 1080);
    const previewHeight = Math.round((preview?.height || 1620) * scale);
    const pagesCount = preview?.pages?.length || 0;
    const showBackgroundButton = canEditBackground && leagueId && preview?.background?.slot;

    return (
        <>
        <Modal isOpen={isOpen} onClose={onClose} title="Анонс матчей" size="wide-lg">
            <div className="flex flex-col md:flex-row gap-6 font-sans">
                {/* Выбор матчей */}
                <div className="flex-1 min-w-0 flex flex-col gap-2 min-h-0">
                    <div className="flex items-center justify-between gap-4">
                        <span className="text-[11px] font-bold text-graphite-light uppercase tracking-wide">Матчи</span>
                        <Checkbox
                            label="Сыгранные"
                            checked={showFinished}
                            onChange={() => setShowFinished(v => !v)}
                            className="text-[13px]"
                        />
                    </div>

                    {visible.length === 0 ? (
                        <div className="text-center py-10 text-[13px] text-graphite-light border border-dashed border-graphite/20 rounded-md">
                            {eligible.length > 0
                                ? 'Предстоящих матчей нет. Отметьте «Сыгранные», чтобы выбрать из прошедших.'
                                : 'В дивизионе нет матчей с назначенными командами.'}
                        </div>
                    ) : (
                        <div className="flex flex-col gap-1.5 md:max-h-[520px] overflow-y-auto custom-scrollbar pr-1">
                            {visible.map(g => {
                                const checked = selection.includes(g.id);
                                return (
                                    <button
                                        key={g.id}
                                        type="button"
                                        onClick={() => toggleGame(g.id)}
                                        className={`flex items-center gap-3 px-3 py-2.5 rounded-md border text-left transition-colors ${
                                            checked ? 'border-orange/40 bg-orange/5' : 'border-graphite/10 bg-white/40 hover:bg-black/5'
                                        }`}
                                    >
                                        <span className={`w-4 h-4 shrink-0 rounded-[5px] border flex items-center justify-center transition-colors ${
                                            checked ? 'bg-orange border-orange' : 'border-graphite-light'
                                        }`}>
                                            <svg className={`w-4 h-4 text-white ${checked ? 'opacity-100' : 'opacity-0'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                            </svg>
                                        </span>
                                        <span className="w-[118px] shrink-0 text-[12px] font-semibold text-graphite-light tabular-nums">
                                            {gameDateLabel(g)}
                                        </span>
                                        <span className="flex-1 min-w-0 truncate text-[13px] font-semibold text-graphite">
                                            {g.home_team_name} — {g.away_team_name}
                                        </span>
                                        <span className="hidden sm:block shrink-0 text-[11px] text-graphite-light">
                                            {groupLabel(g)}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Превью */}
                <div className="md:w-[260px] shrink-0 flex flex-col items-center gap-3">
                    <span className="self-start text-[11px] font-bold text-graphite-light uppercase tracking-wide">
                        Превью{pagesCount > 1 ? ` · ${pagesCount} картинки` : ''}
                    </span>
                    {selection.length === 0 ? (
                        <div
                            className="flex items-center justify-center text-center px-6 text-[13px] text-graphite-light border border-dashed border-graphite/20 rounded-md"
                            style={{ width: PREVIEW_WIDTH, height: previewHeight }}
                        >
                            Выберите матчи
                        </div>
                    ) : !preview ? (
                        <div className="flex items-center justify-center rounded-md bg-graphite/5" style={{ width: PREVIEW_WIDTH, height: previewHeight }}>
                            <Loader />
                        </div>
                    ) : (
                        <div className={`flex flex-col gap-3 transition-opacity ${isPreviewLoading ? 'opacity-50' : ''}`}>
                            {preview.pages.map((html, i) => (
                                <div
                                    key={i}
                                    className="relative overflow-hidden rounded-md shadow-sm bg-graphite/10"
                                    style={{ width: PREVIEW_WIDTH, height: previewHeight }}
                                >
                                    {/* Песочница без allow-same-origin: шаблон исполняет свой
                                        скрипт подгонки надписей, но до страницы LMS не дотянется */}
                                    <iframe
                                        title={`Анонс ${i + 1}`}
                                        srcDoc={html}
                                        sandbox="allow-scripts"
                                        scrolling="no"
                                        style={{
                                            width: preview.width,
                                            height: preview.height,
                                            border: 0,
                                            transform: `scale(${scale})`,
                                            transformOrigin: '0 0',
                                            pointerEvents: 'none',
                                        }}
                                    />
                                    {pagesCount > 1 && (
                                        <span className="absolute top-2 left-2 px-2 py-0.5 rounded bg-graphite/70 text-white text-[11px] font-bold">
                                            {i + 1} из {pagesCount}
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {showBackgroundButton && (
                        <>
                            <input
                                ref={bgInputRef}
                                type="file"
                                accept={BG_TYPES.join(',')}
                                className="hidden"
                                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleBackgroundPicked(f); e.target.value = ''; }}
                            />
                            <button
                                type="button"
                                onClick={() => bgInputRef.current?.click()}
                                disabled={isBackgroundUploading}
                                className="flex items-center gap-2 text-[12px] font-bold text-graphite-light hover:text-orange transition-colors disabled:opacity-40"
                            >
                                <Icon name="upload" className="w-4 h-4" />
                                {isBackgroundUploading ? 'Загружаем фон…' : 'Сменить фон'}
                            </button>
                        </>
                    )}
                </div>
            </div>

            {notice && (
                <div className={`mt-5 px-4 py-2.5 rounded-md border text-[13px] font-medium ${
                    notice.type === 'error'
                        ? 'border-status-rejected/20 bg-status-rejected/5 text-status-rejected'
                        : 'border-orange/20 bg-orange/5 text-orange'
                }`}>
                    {notice.text}
                </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-5 mt-6 border-t border-graphite/10">
                <span className="text-[12px] text-graphite-light">
                    {selection.length > 0
                        ? `Выбрано матчей: ${selection.length}${pagesCount ? ` · картинок: ${pagesCount}` : ''}`
                        : 'Матчи не выбраны'}
                </span>
                <Button
                    onClick={handleDownload}
                    isLoading={isDownloading}
                    loadingText="Готовим…"
                    disabled={selection.length === 0 || isDownloading || isBackgroundUploading}
                    className="w-full sm:w-auto"
                >
                    <Icon name="download" className="w-4 h-4" /> Скачать
                </Button>
            </div>

        </Modal>

        {/* Подтверждение — отдельным слоем в body: внутри окна анонса его зажали бы
            размытие и анимация модалки (fixed-элемент считается от них, а не от экрана) */}
        {createPortal(
            <ConfirmModal
                isOpen={!!pendingBackground}
                onClose={() => !isBackgroundUploading && setPendingBackground(null)}
                onConfirm={handleBackgroundUpload}
                isLoading={isBackgroundUploading}
                title="Заменить фон анонса?"
                message={preview?.background?.own
                    ? 'Новый фон появится во всех анонсах лиги. Прежний фон будет удалён навсегда — вернуть его не получится, если у вас нет копии файла.'
                    : 'Новый фон появится во всех анонсах лиги вместо общего фона платформы. Вернуть общий фон сможет только администратор платформы.'}
                confirmLabel="Заменить"
                confirmingLabel="Загружаем..."
            />,
            document.body
        )}
        </>
    );
}

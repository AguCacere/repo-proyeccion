// ── Config ──────────────────────────────────────────────────────────────────
const ANTHROPIC_API_KEY = 'YOUR_ANTHROPIC_API_KEY_HERE';
const AI_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours in ms

// ── State ────────────────────────────────────────────────────────────────────
let activeFrom = ''; // YYYY-MM-DD
let activeTo   = ''; // YYYY-MM-DD

// ── Date helpers ─────────────────────────────────────────────────────────────
function toYMD(date) {
    return date.toISOString().slice(0, 10);
}

function parseYMD(str) {
    const [y, m, d] = str.split('-').map(Number);
    return new Date(y, m - 1, d);
}

function addDays(dateStr, days) {
    const d = parseYMD(dateStr);
    d.setDate(d.getDate() + days);
    return toYMD(d);
}

function diffDays(from, to) {
    return Math.round((parseYMD(to) - parseYMD(from)) / 86400000);
}

function firstDayOfMonth(year, month) {
    return `${year}-${String(month).padStart(2,'0')}-01`;
}

function lastDayOfMonth(year, month) {
    const d = new Date(year, month, 0); // day 0 of next month = last day of this month
    return toYMD(d);
}

const MONTH_NAMES_ES      = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const MONTH_NAMES_FULL_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

// ── Parsing helpers ───────────────────────────────────────────────────────────
function parseDemoraToMinutes(str) {
    if (!str || str === '00:00:00' || str === '00:00') return 0;
    const parts = str.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return 0;
}

function minutesToHhMm(totalMinutes) {
    if (!totalMinutes || totalMinutes <= 0) return '0min';
    const h = Math.floor(totalMinutes / 60);
    const m = Math.round(totalMinutes % 60);
    if (h === 0) return `${m}min`;
    return `${h}h ${String(m).padStart(2,'0')}min`;
}

function _esc(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Subtitle logic ────────────────────────────────────────────────────────────
function buildSubtitle(from, to) {
    // Check if it's exactly a full month
    const [fy, fm] = from.split('-').map(Number);
    const [ty, tm] = to.split('-').map(Number);
    if (
        fy === ty && fm === tm &&
        from === firstDayOfMonth(fy, fm) &&
        to   === lastDayOfMonth(ty, tm)
    ) {
        return `Resumen de ${MONTH_NAMES_FULL_ES[fm - 1]} ${fy}`;
    }
    const fmtFrom = from.split('-').reverse().join('/');
    const fmtTo   = to.split('-').reverse().join('/');
    return `Resumen del ${fmtFrom} al ${fmtTo}`;
}

// ── Shortcut ranges ───────────────────────────────────────────────────────────
function getRangeForShortcut(shortcut) {
    const now   = new Date();
    const year  = now.getFullYear();
    const month = now.getMonth() + 1;

    switch (shortcut) {
        case 'this-month':
            return { from: firstDayOfMonth(year, month), to: lastDayOfMonth(year, month) };
        case 'last-month': {
            const d = new Date(year, month - 2, 1);
            const ly = d.getFullYear(), lm = d.getMonth() + 1;
            return { from: firstDayOfMonth(ly, lm), to: lastDayOfMonth(ly, lm) };
        }
        case 'last-3-months': {
            const d = new Date(year, month - 4, 1);
            const ly = d.getFullYear(), lm = d.getMonth() + 1;
            return { from: firstDayOfMonth(ly, lm), to: lastDayOfMonth(year, month) };
        }
        case 'this-year':
            return { from: `${year}-01-01`, to: `${year}-12-31` };
        default:
            return { from: firstDayOfMonth(year, month), to: lastDayOfMonth(year, month) };
    }
}

// Detect which shortcut matches the current range (for active pill highlighting)
function detectShortcut(from, to) {
    for (const key of ['this-month','last-month','last-3-months','this-year']) {
        const r = getRangeForShortcut(key);
        if (r.from === from && r.to === to) return key;
    }
    return null;
}

// ── Data fetching ─────────────────────────────────────────────────────────────

// Some records in Supabase store Fecha as DD/MM/YYYY — normalize to YYYY-MM-DD
// before any comparison (same logic as app.js fetchProjections).
function normalizeFecha(raw) {
    if (!raw) return '';
    if (raw.includes('/')) {
        const parts = raw.split('/');
        if (parts.length === 3) {
            const [d, m, y] = parts;
            return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
        }
    }
    return raw; // already YYYY-MM-DD
}

// Fetches ALL records then filters client-side on normalized dates.
// Server-side .gte/.lte cannot be used because Fecha is stored as text and
// some rows use DD/MM/YYYY, which fails lexicographic comparison against YYYY-MM-DD bounds.
let _allRowsCache = null;

async function fetchAllRows() {
    if (_allRowsCache) return _allRowsCache;
    const { data, error } = await supabaseClient
        .from('Estimacion')
        .select('Fecha, Tipo, Demoras, MotivoDemora');
    if (error) { console.error('Supabase error:', error); return []; }
    _allRowsCache = (data || []).map(r => ({
        fecha: normalizeFecha(r.Fecha),
        tipo: r.Tipo || '',
        demoras: r.Demoras || '',
        motivoDemora: r.MotivoDemora || '',
        demoraMinutes: parseDemoraToMinutes(r.Demoras),
    }));
    return _allRowsCache;
}

async function fetchRangeData(from, to) {
    const all = await fetchAllRows();
    return all.filter(r => r.fecha >= from && r.fecha <= to);
}

// Returns the equivalent previous period (same duration, immediately before `from`)
function prevPeriodRange(from, to) {
    const days = diffDays(from, to);
    const prevTo   = addDays(from, -1);
    const prevFrom = addDays(prevTo, -days);
    return { from: prevFrom, to: prevTo };
}

// ── KPI calculation ───────────────────────────────────────────────────────────
function calcKPIs(rows) {
    const total = rows.length;
    // Exclude records where Demoras is '00:00:00', null or '' (demoraMinutes === 0)
    const withDelay = rows.filter(r => r.demoraMinutes > 0);
    const pctDelay = total > 0 ? Math.round((withDelay.length / total) * 100) : 0;
    const acumMinutes = withDelay.reduce((s, r) => s + r.demoraMinutes, 0);
    const avgMinutes = withDelay.length > 0 ? acumMinutes / withDelay.length : 0;
    return { total, withDelayCount: withDelay.length, pctDelay, acumMinutes, avgMinutes };
}

// ── Render KPI Cards ──────────────────────────────────────────────────────────
function _setBadgeClass(id, cls) {
    const el = document.getElementById(id);
    el.classList.remove('up','down','neutral');
    el.classList.add(cls);
}

function renderKPIs(kpis, prevKpis) {
    document.getElementById('kpiTotal').textContent = kpis.total;

    document.getElementById('kpiPct').textContent = `${kpis.pctDelay}%`;
    document.getElementById('kpiPctBadge').textContent = `${kpis.withDelayCount} registros`;
    if (prevKpis) {
        _setBadgeClass('kpiPctBadge', kpis.pctDelay > prevKpis.pctDelay ? 'down' : 'up');
    }

    document.getElementById('kpiAcum').textContent = minutesToHhMm(kpis.acumMinutes);
    if (prevKpis) {
        const diff = kpis.acumMinutes - prevKpis.acumMinutes;
        const badge = document.getElementById('kpiAcumBadge');
        badge.textContent = diff >= 0
            ? `▲ ${minutesToHhMm(Math.abs(diff))} vs período ant.`
            : `▼ ${minutesToHhMm(Math.abs(diff))} vs período ant.`;
        _setBadgeClass('kpiAcumBadge', diff > 0 ? 'down' : 'up');
    }

    document.getElementById('kpiAvg').textContent = minutesToHhMm(kpis.avgMinutes);
    if (prevKpis && prevKpis.avgMinutes > 0) {
        const diff = kpis.avgMinutes - prevKpis.avgMinutes;
        const badge = document.getElementById('kpiAvgBadge');
        badge.textContent = diff >= 0
            ? `▲ ${minutesToHhMm(Math.abs(diff))} vs período ant.`
            : `▼ ${minutesToHhMm(Math.abs(diff))} vs período ant.`;
        _setBadgeClass('kpiAvgBadge', diff > 0 ? 'down' : 'up');
    }
}

// ── Trend chart (always last 6 months — not affected by filter) ───────────────
let trendChartInstance = null;

async function loadAndRenderTrendChart() {
    const now   = new Date();
    const year  = now.getFullYear();
    const month = now.getMonth() + 1;

    // Build 6-month list (oldest → newest)
    const months = [];
    for (let i = 5; i >= 0; i--) {
        const d = new Date(year, month - 1 - i, 1);
        months.push({ year: d.getFullYear(), month: d.getMonth() + 1 });
    }

    // Single query spanning the full 6-month window
    const rangeFrom = firstDayOfMonth(months[0].year, months[0].month);
    const rangeTo   = lastDayOfMonth(months[months.length - 1].year, months[months.length - 1].month);
    const allRows   = await fetchRangeData(rangeFrom, rangeTo);

    console.log(`[Tendencia] Registros traídos (${rangeFrom} → ${rangeTo}): ${allRows.length}`, allRows);

    // Group client-side by YYYY-MM using Fecha.substring(0, 7)
    // Exclude records where Demoras is '00:00:00', null or '' (demoraMinutes === 0)
    const byMonth = {};
    months.forEach(m => {
        byMonth[`${m.year}-${String(m.month).padStart(2, '0')}`] = 0;
    });

    allRows.forEach(r => {
        const key = (r.fecha || '').substring(0, 7); // e.g. "2026-02"
        if (key in byMonth && r.demoraMinutes > 0) {
            byMonth[key] += r.demoraMinutes;
        }
    });

    console.log('[Tendencia] Minutos acumulados por mes:', byMonth);

    const labels = months.map(m => MONTH_NAMES_ES[m.month - 1]);
    const values = months.map(m => byMonth[`${m.year}-${String(m.month).padStart(2, '0')}`] || 0);

    const ctx = document.getElementById('trendChart').getContext('2d');
    if (trendChartInstance) trendChartInstance.destroy();

    trendChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Minutos de demora',
                data: values,
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59,130,246,0.06)',
                borderWidth: 2,
                pointBackgroundColor: '#3b82f6',
                pointRadius: 4,
                pointHoverRadius: 6,
                tension: 0.4,
                fill: true,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1f2937',
                    titleColor: '#f9fafb',
                    bodyColor: '#d1d5db',
                    padding: 10,
                    callbacks: { label: ctx => ` ${minutesToHhMm(ctx.parsed.y)}` }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { font: { size: 11 }, color: '#9ca3af' },
                    border: { display: false },
                },
                y: {
                    grid: { color: '#f3f4f6' },
                    ticks: {
                        font: { size: 11 },
                        color: '#9ca3af',
                        callback: v => minutesToHhMm(v),
                    },
                    border: { display: false },
                }
            }
        }
    });
}

// ── Top motivos table ─────────────────────────────────────────────────────────
function renderTopMotivos(rows) {
    const container = document.getElementById('topMotivosContainer');
    const withDelay = rows.filter(r => r.demoraMinutes > 0 && r.motivoDemora.trim());

    if (withDelay.length === 0) {
        container.innerHTML = `<div class="empty-state"><span class="es-icon">✅</span>Sin demoras registradas en este período.</div>`;
        return;
    }

    const map = {};
    withDelay.forEach(r => {
        const key = r.motivoDemora.trim();
        if (!map[key]) map[key] = { motivo: key, totalMin: 0, count: 0 };
        map[key].totalMin += r.demoraMinutes;
        map[key].count    += 1;
    });

    const sorted = Object.values(map).sort((a, b) => b.totalMin - a.totalMin).slice(0, 5);
    const rankClasses = ['top1','top2','top3','',''];

    const rowsHtml = sorted.map((item, i) => `
        <tr>
            <td class="motivo-cell">
                <span class="rank-badge ${rankClasses[i]}">${i + 1}</span>
                <span class="motivo-text" title="${_esc(item.motivo)}">${_esc(item.motivo)}</span>
            </td>
            <td class="num-cell">${minutesToHhMm(item.totalMin)}</td>
            <td class="num-cell">${item.count}</td>
        </tr>
    `).join('');

    container.innerHTML = `
        <table class="top-table">
            <thead><tr><th>Motivo</th><th>Tiempo total</th><th>Ocurrencias</th></tr></thead>
            <tbody>${rowsHtml}</tbody>
        </table>
    `;
}

// ── AI Insight ────────────────────────────────────────────────────────────────
async function renderAIInsight(rows, kpis, from, to) {
    const aiBody      = document.getElementById('aiBody');
    const aiCacheNote = document.getElementById('aiCacheNote');
    const cacheKey    = `sqr_ai_insight_${from}_${to}`;

    // Check cache
    try {
        const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
        if (cached && (Date.now() - cached.ts) < AI_CACHE_TTL) {
            aiBody.textContent = cached.text;
            aiCacheNote.textContent = 'Caché · actualiza en ' + _formatCacheAge(cached.ts);
            return;
        }
    } catch (_) {}

    // Skeleton
    aiBody.innerHTML = `<div class="ai-skeleton">
        <div class="sk-line"></div><div class="sk-line"></div>
        <div class="sk-line"></div><div class="sk-line"></div>
    </div>`;
    aiCacheNote.textContent = 'Generando análisis con IA…';

    const periodLabel = buildSubtitle(from, to);
    const withDelay   = rows.filter(r => r.demoraMinutes > 0);
    const detailList  = withDelay.slice(0, 40).map(r =>
        `- Tipo: ${r.tipo || 'N/A'} | Motivo: ${r.motivoDemora || 'N/A'} | Demora: ${minutesToHhMm(r.demoraMinutes)}`
    ).join('\n');

    const userMessage = `KPIs del período (${periodLabel}):
- Total registros: ${kpis.total}
- Registros con demora: ${kpis.withDelayCount} (${kpis.pctDelay}% del total)
- Tiempo acumulado de demoras: ${minutesToHhMm(kpis.acumMinutes)}
- Promedio de demora (solo con demora): ${minutesToHhMm(kpis.avgMinutes)}

Detalle de registros con demora:
${detailList || 'Sin registros con demora.'}`;

    try {
        const resp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true',
            },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 300,
                system: 'Sos un analista de operaciones bancarias. Recibís KPIs y el detalle de demoras del período seleccionado. Generá un análisis corto (3-4 oraciones) identificando patrones, procesos más afectados y una recomendación concreta. Respondé en español, tono profesional y directo. No uses listas, solo prosa fluida.',
                messages: [{ role: 'user', content: userMessage }],
            }),
        });

        if (!resp.ok) throw new Error(`API error ${resp.status}`);
        const json = await resp.json();
        const text = json.content?.[0]?.text || 'Sin respuesta.';

        localStorage.setItem(cacheKey, JSON.stringify({ text, ts: Date.now() }));
        aiBody.textContent = text;
        aiCacheNote.textContent = 'Generado ahora · válido 6 horas';
    } catch (err) {
        console.error('AI Insight error:', err);
        aiBody.textContent = 'No se pudo generar el análisis. Verificá la API key o intentá más tarde.';
        aiCacheNote.textContent = 'Error al conectar con la API';
    }
}

function _formatCacheAge(ts) {
    const diffMs = AI_CACHE_TTL - (Date.now() - ts);
    const h = Math.floor(diffMs / 3600000);
    const m = Math.floor((diffMs % 3600000) / 60000);
    return `${h}h ${m}min`;
}

// ── Apply filter — main data refresh ─────────────────────────────────────────
async function applyFilter() {
    const from = activeFrom;
    const to   = activeTo;

    // Update subtitle
    document.getElementById('pageSubtitle').textContent = buildSubtitle(from, to);

    // Update date inputs
    document.getElementById('inputFrom').value = from;
    document.getElementById('inputTo').value   = to;

    // Highlight active pill
    const active = detectShortcut(from, to);
    document.querySelectorAll('.shortcut-pill').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.shortcut === active);
    });

    // Fetch current range + previous period in parallel
    const prev = prevPeriodRange(from, to);
    const [currentRows, prevRows] = await Promise.all([
        fetchRangeData(from, to),
        fetchRangeData(prev.from, prev.to),
    ]);

    const kpis     = calcKPIs(currentRows);
    const prevKpis = calcKPIs(prevRows);

    renderKPIs(kpis, prevKpis);
    renderTopMotivos(currentRows);
    await renderAIInsight(currentRows, kpis, from, to);
}

// ── Filter UI wiring ──────────────────────────────────────────────────────────
function initFilter() {
    const now   = new Date();
    const year  = now.getFullYear();
    const month = now.getMonth() + 1;

    // Default: current month
    activeFrom = firstDayOfMonth(year, month);
    activeTo   = lastDayOfMonth(year, month);

    document.getElementById('inputFrom').value = activeFrom;
    document.getElementById('inputTo').value   = activeTo;

    // Shortcut pills
    document.querySelectorAll('.shortcut-pill').forEach(btn => {
        btn.addEventListener('click', () => {
            const range = getRangeForShortcut(btn.dataset.shortcut);
            activeFrom = range.from;
            activeTo   = range.to;
            applyFilter();
        });
    });

    // Apply button
    document.getElementById('btnApply').addEventListener('click', () => {
        const from = document.getElementById('inputFrom').value;
        const to   = document.getElementById('inputTo').value;
        if (!from || !to) return;
        if (from > to) {
            alert('La fecha "Desde" debe ser anterior o igual a "Hasta".');
            return;
        }
        activeFrom = from;
        activeTo   = to;
        applyFilter();
    });
}

// ── Main ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
    _allRowsCache = null; // fresh fetch on each page load
    initFilter();

    // Trend chart is independent — always last 6 months
    loadAndRenderTrendChart();

    // Initial data load with default range
    applyFilter();
});

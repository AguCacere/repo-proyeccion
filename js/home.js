// ── Config ──────────────────────────────────────────────────────────────────
const ANTHROPIC_API_KEY = 'YOUR_ANTHROPIC_API_KEY_HERE';
const AI_CACHE_KEY = 'sqr_ai_insight';
const AI_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours in ms

// ── Helpers ──────────────────────────────────────────────────────────────────
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
    return `${h}h ${String(m).padStart(2, '0')}min`;
}

// Returns { year, month } for N months ago (month is 1-based)
function monthOffset(baseYear, baseMonth, delta) {
    let m = baseMonth - 1 + delta; // 0-based
    let y = baseYear + Math.floor(m / 12);
    m = ((m % 12) + 12) % 12;
    return { year: y, month: m + 1 };
}

const MONTH_NAMES_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MONTH_NAMES_FULL_ES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

// ── Data fetching ─────────────────────────────────────────────────────────────
async function fetchMonthData(year, month) {
    const from = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const { data, error } = await supabaseClient
        .from('Estimacion')
        .select('Fecha, Tipo, Demoras, MotivoDemora')
        .gte('Fecha', from)
        .lte('Fecha', to);

    if (error) { console.error('Supabase error:', error); return []; }
    return (data || []).map(r => ({
        fecha: r.Fecha,
        tipo: r.Tipo || '',
        demoras: r.Demoras || '',
        motivoDemora: r.MotivoDemora || '',
        demoraMinutes: parseDemoraToMinutes(r.Demoras),
    }));
}

// ── KPI calculation ───────────────────────────────────────────────────────────
function calcKPIs(rows) {
    const total = rows.length;
    const withDelay = rows.filter(r => r.demoraMinutes > 0);
    const pctDelay = total > 0 ? Math.round((withDelay.length / total) * 100) : 0;
    const acumMinutes = rows.reduce((s, r) => s + r.demoraMinutes, 0);
    const avgMinutes = withDelay.length > 0 ? acumMinutes / withDelay.length : 0;
    return { total, withDelayCount: withDelay.length, pctDelay, acumMinutes, avgMinutes };
}

// ── Render KPI Cards ──────────────────────────────────────────────────────────
function renderKPIs(kpis, prevKpis) {
    document.getElementById('kpiTotal').textContent = kpis.total;

    // % con demora
    document.getElementById('kpiPct').textContent = `${kpis.pctDelay}%`;
    document.getElementById('kpiPctBadge').textContent = `${kpis.withDelayCount} registros`;
    _setBadgeClass('kpiPctBadge', kpis.pctDelay > (prevKpis?.pctDelay ?? kpis.pctDelay) ? 'down' : 'up');

    // Tiempo acumulado
    document.getElementById('kpiAcum').textContent = minutesToHhMm(kpis.acumMinutes);
    if (prevKpis) {
        const diff = kpis.acumMinutes - prevKpis.acumMinutes;
        const badge = document.getElementById('kpiAcumBadge');
        badge.textContent = diff >= 0
            ? `▲ ${minutesToHhMm(Math.abs(diff))} vs mes ant.`
            : `▼ ${minutesToHhMm(Math.abs(diff))} vs mes ant.`;
        _setBadgeClass('kpiAcumBadge', diff > 0 ? 'down' : 'up');
    }

    // Promedio
    document.getElementById('kpiAvg').textContent = minutesToHhMm(kpis.avgMinutes);
    if (prevKpis && prevKpis.avgMinutes > 0) {
        const diff = kpis.avgMinutes - prevKpis.avgMinutes;
        const badge = document.getElementById('kpiAvgBadge');
        badge.textContent = diff >= 0
            ? `▲ ${minutesToHhMm(Math.abs(diff))} vs mes ant.`
            : `▼ ${minutesToHhMm(Math.abs(diff))} vs mes ant.`;
        _setBadgeClass('kpiAvgBadge', diff > 0 ? 'down' : 'up');
    }
}

function _setBadgeClass(id, cls) {
    const el = document.getElementById(id);
    el.classList.remove('up', 'down', 'neutral');
    el.classList.add(cls);
}

// ── Trend chart ───────────────────────────────────────────────────────────────
let trendChartInstance = null;

function renderTrendChart(labels, values) {
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
                    callbacks: {
                        label: ctx => ` ${minutesToHhMm(ctx.parsed.y)}`,
                    }
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
        container.innerHTML = `<div class="empty-state"><span class="es-icon">✅</span>Sin demoras registradas este mes.</div>`;
        return;
    }

    // Aggregate by motivoDemora
    const map = {};
    withDelay.forEach(r => {
        const key = r.motivoDemora.trim();
        if (!map[key]) map[key] = { motivo: key, tipo: r.tipo, totalMin: 0, count: 0 };
        map[key].totalMin += r.demoraMinutes;
        map[key].count += 1;
    });

    const sorted = Object.values(map).sort((a, b) => b.totalMin - a.totalMin).slice(0, 5);

    const rankClasses = ['top1', 'top2', 'top3', '', ''];

    const rows_html = sorted.map((item, i) => `
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
            <thead>
                <tr>
                    <th>Motivo</th>
                    <th>Tiempo total</th>
                    <th>Ocurrencias</th>
                </tr>
            </thead>
            <tbody>${rows_html}</tbody>
        </table>
    `;
}

function _esc(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── AI Insight ────────────────────────────────────────────────────────────────
async function renderAIInsight(rows, kpis, monthLabel) {
    const aiBody = document.getElementById('aiBody');
    const aiCacheNote = document.getElementById('aiCacheNote');

    // Check cache
    try {
        const cached = JSON.parse(localStorage.getItem(AI_CACHE_KEY) || 'null');
        if (cached && cached.month === monthLabel && (Date.now() - cached.ts) < AI_CACHE_TTL) {
            aiBody.textContent = cached.text;
            aiCacheNote.textContent = 'Caché — actualiza en ' + _formatCacheAge(cached.ts);
            return;
        }
    } catch (_) {}

    // Show skeleton while loading
    aiBody.innerHTML = `<div class="ai-skeleton">
        <div class="sk-line"></div>
        <div class="sk-line"></div>
        <div class="sk-line"></div>
        <div class="sk-line"></div>
    </div>`;
    aiCacheNote.textContent = 'Generando análisis con IA…';

    const withDelay = rows.filter(r => r.demoraMinutes > 0);
    const detailList = withDelay.slice(0, 40).map(r =>
        `- Tipo: ${r.tipo || 'N/A'} | Motivo: ${r.motivoDemora || 'N/A'} | Demora: ${minutesToHhMm(r.demoraMinutes)}`
    ).join('\n');

    const userMessage = `KPIs del mes (${monthLabel}):
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
                system: 'Sos un analista de operaciones bancarias. Recibís KPIs y el detalle de demoras del mes en curso. Generá un análisis corto (3-4 oraciones) identificando patrones, procesos más afectados y una recomendación concreta. Respondé en español, tono profesional y directo. No uses listas, solo prosa fluida.',
                messages: [{ role: 'user', content: userMessage }],
            }),
        });

        if (!resp.ok) throw new Error(`API error ${resp.status}`);
        const json = await resp.json();
        const text = json.content?.[0]?.text || 'Sin respuesta.';

        // Cache result
        localStorage.setItem(AI_CACHE_KEY, JSON.stringify({ month: monthLabel, text, ts: Date.now() }));

        aiBody.textContent = text;
        aiCacheNote.textContent = `Generado ahora · válido 6 horas`;
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

// ── Main ──────────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1; // 1-based
    const monthLabel = `${MONTH_NAMES_FULL_ES[month - 1]} ${year}`;

    document.getElementById('pageSubtitle').textContent = `Resumen de ${monthLabel}`;

    // Fetch current month + previous month in parallel
    const [currentRows, prevRows] = await Promise.all([
        fetchMonthData(year, month),
        fetchMonthData(...Object.values(monthOffset(year, month, -1))),
    ]);

    const kpis = calcKPIs(currentRows);
    const prevKpis = calcKPIs(prevRows);

    // KPI cards
    renderKPIs(kpis, prevKpis);

    // Trend chart: last 6 months
    const trendLabels = [];
    const trendValues = [];

    // Fetch last 6 months in parallel (current month is already fetched)
    const monthsToFetch = [];
    for (let i = 5; i >= 1; i--) {
        monthsToFetch.push(monthOffset(year, month, -i));
    }

    const trendFetches = await Promise.all(
        monthsToFetch.map(m => fetchMonthData(m.year, m.month))
    );

    // Build labels + values: months[-5..-1] + current
    monthsToFetch.forEach((m, i) => {
        trendLabels.push(MONTH_NAMES_ES[m.month - 1]);
        trendValues.push(calcKPIs(trendFetches[i]).acumMinutes);
    });
    trendLabels.push(MONTH_NAMES_ES[month - 1]);
    trendValues.push(kpis.acumMinutes);

    renderTrendChart(trendLabels, trendValues);

    // Top motivos
    renderTopMotivos(currentRows);

    // AI Insight
    await renderAIInsight(currentRows, kpis, monthLabel);
});

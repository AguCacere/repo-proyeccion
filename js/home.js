// ── Config ──────────────────────────────────────────────────────────────────
const AI_CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours in ms

// ── State ────────────────────────────────────────────────────────────────────
let activeFrom  = ''; // YYYY-MM-DD
let activeTo    = ''; // YYYY-MM-DD
let _pickerFrom = null;
let _pickerTo   = null;

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

// ── Custom Day Picker ─────────────────────────────────────────────────────────
function _createDayPicker({ wrapperId, hiddenInputId, displayId, triggerId }) {
    const wrapper   = document.getElementById(wrapperId);
    const triggerEl = document.getElementById(triggerId);
    const displayEl = document.getElementById(displayId);
    const hiddenEl  = document.getElementById(hiddenInputId);

    let viewYear     = new Date().getFullYear();
    let viewMonth    = new Date().getMonth() + 1;
    let selectedDate = null; // 'YYYY-MM-DD' or null

    // Inject dropdown
    const dropdown = document.createElement('div');
    dropdown.className = 'cdp-dropdown';
    dropdown.innerHTML = `
        <div class="cdp-header">
            <button class="cdp-nav-btn cdp-prev">&#9664;</button>
            <span class="cdp-month-label"></span>
            <button class="cdp-nav-btn cdp-next">&#9654;</button>
        </div>
        <div class="cdp-weekdays">
            <span class="cdp-weekday">LU</span><span class="cdp-weekday">MA</span>
            <span class="cdp-weekday">MI</span><span class="cdp-weekday">JU</span>
            <span class="cdp-weekday">VI</span><span class="cdp-weekday">SA</span>
            <span class="cdp-weekday">DO</span>
        </div>
        <div class="cdp-days"></div>
        <div class="cdp-footer">
            <button class="cdp-btn-clear">Borrar</button>
            <button class="cdp-btn-today">Hoy</button>
        </div>`;
    wrapper.appendChild(dropdown);

    const monthLabel = dropdown.querySelector('.cdp-month-label');
    const daysGrid   = dropdown.querySelector('.cdp-days');

    function renderCalendar() {
        const mn = MONTH_NAMES_FULL_ES[viewMonth - 1];
        monthLabel.textContent = mn.charAt(0).toUpperCase() + mn.slice(1) + ' ' + viewYear;

        // ISO week offset: Monday = col 0
        const firstDayJS  = new Date(viewYear, viewMonth - 1, 1).getDay(); // 0=Sun
        const startOffset = (firstDayJS + 6) % 7;
        const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
        const today       = toYMD(new Date());

        let html = '';
        for (let i = 0; i < startOffset; i++) {
            html += `<button class="cdp-day" disabled></button>`;
        }
        for (let d = 1; d <= daysInMonth; d++) {
            const ds  = `${viewYear}-${String(viewMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            const cls = ['cdp-day', ds === today ? 'today' : '', ds === selectedDate ? 'selected' : ''].filter(Boolean).join(' ');
            html += `<button class="${cls}" data-date="${ds}">${d}</button>`;
        }
        daysGrid.innerHTML = html;

        daysGrid.querySelectorAll('[data-date]').forEach(btn => {
            btn.addEventListener('click', () => { _select(btn.dataset.date); _close(); });
        });
    }

    function _select(ds) {
        selectedDate   = ds;
        hiddenEl.value = ds;
        const [y, m, d] = ds.split('-');
        displayEl.textContent = `${d}/${m}/${y}`;
        renderCalendar();
    }

    function _clear() {
        selectedDate          = null;
        hiddenEl.value        = '';
        displayEl.textContent = 'dd/mm/aaaa';
        renderCalendar();
    }

    function _open() {
        document.querySelectorAll('.cdp-dropdown.open').forEach(el => {
            if (el !== dropdown) {
                el.classList.remove('open');
                el.closest('.custom-day-picker')?.querySelector('.cdp-trigger')?.classList.remove('open');
            }
        });
        dropdown.classList.add('open');
        triggerEl.classList.add('open');
    }

    function _close() {
        dropdown.classList.remove('open');
        triggerEl.classList.remove('open');
    }

    triggerEl.addEventListener('click', e => {
        e.stopPropagation();
        dropdown.classList.contains('open') ? _close() : _open();
    });

    dropdown.querySelector('.cdp-prev').addEventListener('click', e => {
        e.stopPropagation();
        if (--viewMonth < 1) { viewMonth = 12; viewYear--; }
        renderCalendar();
    });

    dropdown.querySelector('.cdp-next').addEventListener('click', e => {
        e.stopPropagation();
        if (++viewMonth > 12) { viewMonth = 1; viewYear++; }
        renderCalendar();
    });

    dropdown.querySelector('.cdp-btn-clear').addEventListener('click', e => {
        e.stopPropagation();
        _clear();
        _close();
    });

    dropdown.querySelector('.cdp-btn-today').addEventListener('click', e => {
        e.stopPropagation();
        const t = toYMD(new Date());
        viewYear  = +t.split('-')[0];
        viewMonth = +t.split('-')[1];
        _select(t);
        _close();
    });

    document.addEventListener('click', e => {
        if (!wrapper.contains(e.target)) _close();
    });

    renderCalendar();

    return {
        setValue(ds) {
            if (ds) {
                viewYear  = +ds.split('-')[0];
                viewMonth = +ds.split('-')[1];
                _select(ds);
            } else {
                _clear();
            }
        }
    };
}

// ── Tipo cleanup (mirrors app.js logic) ──────────────────────────────────────
// Supabase stores some Tipo values with encoding artifacts (e.g. "Hbil", "Da").
// Apply the same regex fixes used in app.js before storing in the cache.
function _cleanTipo(raw) {
    if (!raw || !raw.trim()) return 'Sin especificar';
    let t = raw.trim()
        .replace(/H[áà]?bil/g, 'Hábil')
        .replace(/D[íì]?a/g, 'Día');
    if (t === 'Da' || t.startsWith('D a')) t = 'Día';
    return t;
}

// Fetches ALL records then filters client-side on normalized dates.
// Server-side .gte/.lte cannot be used because Fecha is stored as text and
// some rows use DD/MM/YYYY, which fails lexicographic comparison against YYYY-MM-DD bounds.
let _allRowsCache = null;

async function fetchAllRows() {
    if (_allRowsCache) return _allRowsCache;

    let result;
    try {
        result = await Promise.race([
            supabaseClient.from('Estimacion').select('Fecha, Tipo, HorarioReal, Demoras, MotivoDemora'),
            new Promise((_, rej) => setTimeout(() => rej(new Error('Timeout: Supabase no respondió en 15s')), 15000)),
        ]);
    } catch (err) {
        console.error('[fetchAllRows]', err);
        throw err; // re-throw so applyFilter can catch and show error
    }

    const { data, error } = result;
    if (error) { console.error('Supabase error:', error); throw new Error(error.message); }
    _allRowsCache = (data || []).map(r => ({
        fecha: normalizeFecha(r.Fecha),
        tipo: _cleanTipo(r.Tipo),
        horarioReal: r.HorarioReal || '',
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

// Human-readable label for the previous period (used in KPI badges)
function buildPrevPeriodLabel(from, to) {
    const [fy, fm] = from.split('-').map(Number);
    const [ty, tm] = to.split('-').map(Number);

    // Full year
    if (from === `${fy}-01-01` && to === `${fy}-12-31` && fy === ty) {
        return `vs ${fy - 1}`;
    }
    // Full month
    if (fy === ty && fm === tm &&
        from === firstDayOfMonth(fy, fm) &&
        to   === lastDayOfMonth(ty, tm)) {
        const d  = new Date(fy, fm - 2, 1);
        const mn = MONTH_NAMES_FULL_ES[d.getMonth()];
        return `vs ${mn.charAt(0).toUpperCase() + mn.slice(1)} ${d.getFullYear()}`;
    }
    // Custom range: equal duration, show DD/MM – DD/MM
    const prev = prevPeriodRange(from, to);
    const fmt  = s => s.split('-').slice(1).reverse().join('/'); // YYYY-MM-DD → DD/MM
    return `vs ${fmt(prev.from)} – ${fmt(prev.to)}`;
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

// ── KPI count-up animation ────────────────────────────────────────────────────
function animateValue(element, start, end, duration, formatter) {
    const startTime = performance.now();
    function update(currentTime) {
        const elapsed  = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased    = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        const current  = start + (end - start) * eased;
        element.textContent = formatter(current);
        if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
}

// ── Render KPI Cards ──────────────────────────────────────────────────────────
function _setBadgeClass(id, cls) {
    const el = document.getElementById(id);
    el.classList.remove('up','down','neutral');
    el.classList.add(cls);
}

function renderKPIs(kpis, prevKpis, prevLabel) {
    const DURATION = 1200;

    // Clear skeleton state
    document.querySelectorAll('.kpi-value').forEach(el => el.classList.remove('skeleton'));

    // Animate each KPI value
    animateValue(
        document.getElementById('kpiTotal'),
        0, kpis.total, DURATION,
        n => Math.round(n)
    );

    animateValue(
        document.getElementById('kpiPct'),
        0, kpis.pctDelay, DURATION,
        n => Math.round(n) + '%'
    );

    animateValue(
        document.getElementById('kpiAcum'),
        0, kpis.acumMinutes, DURATION,
        n => minutesToHhMm(n)
    );

    animateValue(
        document.getElementById('kpiAvg'),
        0, kpis.avgMinutes, DURATION,
        n => minutesToHhMm(n)
    );

    // Badges (set immediately — no animation needed)
    document.getElementById('kpiPctBadge').textContent = `${kpis.withDelayCount} registros`;
    document.getElementById('kpiTotalBadge').textContent = `${kpis.total} registros`;
    if (prevKpis) {
        _setBadgeClass('kpiPctBadge', kpis.pctDelay > prevKpis.pctDelay ? 'down' : 'up');
    }

    if (prevKpis) {
        const diff = kpis.acumMinutes - prevKpis.acumMinutes;
        const badge = document.getElementById('kpiAcumBadge');
        badge.textContent = diff >= 0
            ? `▲ ${minutesToHhMm(Math.abs(diff))} ${prevLabel}`
            : `▼ ${minutesToHhMm(Math.abs(diff))} ${prevLabel}`;
        _setBadgeClass('kpiAcumBadge', diff > 0 ? 'down' : 'up');
    }

    if (prevKpis && prevKpis.avgMinutes > 0) {
        const diff = kpis.avgMinutes - prevKpis.avgMinutes;
        const badge = document.getElementById('kpiAvgBadge');
        badge.textContent = diff >= 0
            ? `▲ ${minutesToHhMm(Math.abs(diff))} ${prevLabel}`
            : `▼ ${minutesToHhMm(Math.abs(diff))} ${prevLabel}`;
        _setBadgeClass('kpiAvgBadge', diff > 0 ? 'down' : 'up');
    }

    // Re-trigger fadeInUp on the cards so animation plays on every filter apply
    document.querySelectorAll('.kpi-card').forEach((card, i) => {
        card.style.animation = 'none';
        // Force reflow so removing the animation actually takes effect
        void card.offsetWidth;
        card.style.animation = `fadeInUp 0.4s ease ${i * 80}ms forwards`;
    });
}

// ── Donut charts ──────────────────────────────────────────────────────────────
let donutTipoInstance   = null;
let donutStatusInstance = null;

const DONUT_COLORS = ['#3B82F6','#8B5CF6','#10B981','#F59E0B','#EF4444','#06B6D4'];

// Inline Chart.js plugin to draw center text on doughnut charts
const centerTextPlugin = {
    id: 'centerText',
    beforeDraw(chart) {
        const cfg = chart.config.options.plugins.centerText;
        if (!cfg) return;
        const { ctx, chartArea } = chart;
        const cx = (chartArea.left + chartArea.right) / 2;
        const cy = (chartArea.top  + chartArea.bottom) / 2;
        ctx.save();
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        if (cfg.line1) {
            ctx.font      = '700 15px Inter, sans-serif';
            ctx.fillStyle = '#111827';
            ctx.fillText(cfg.line1, cx, cy - 9);
        }
        if (cfg.line2) {
            ctx.font      = '11px Inter, sans-serif';
            ctx.fillStyle = '#9CA3AF';
            ctx.fillText(cfg.line2, cx, cy + 9);
        }
        ctx.restore();
    }
};

function renderDonutCharts(rows) {
    // ── Donut A: tiempo acumulado por Tipo ──
    const tipoMap = {};
    rows.forEach(r => {
        if (r.demoraMinutes > 0) {
            const tipo = (r.tipo && r.tipo.trim()) ? r.tipo.trim() : 'Sin especificar';
            tipoMap[tipo] = (tipoMap[tipo] || 0) + r.demoraMinutes;
        }
    });

    const tipoSorted  = Object.entries(tipoMap).sort((a, b) => b[1] - a[1]);
    const totalTipoMin = tipoSorted.reduce((s, [, v]) => s + v, 0);
    const tipoColors  = tipoSorted.map((_, i) => DONUT_COLORS[i % DONUT_COLORS.length]);

    if (donutTipoInstance) donutTipoInstance.destroy();
    const ctxA = document.getElementById('donutTipoChart').getContext('2d');
    donutTipoInstance = new Chart(ctxA, {
        type: 'doughnut',
        plugins: [centerTextPlugin],
        data: {
            labels: tipoSorted.map(([k]) => k),
            datasets: [{
                data: tipoSorted.map(([, v]) => v),
                backgroundColor: tipoColors,
                borderWidth: 2,
                borderColor: '#ffffff',
                hoverBorderColor: '#ffffff',
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '68%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1f2937',
                    callbacks: { label: ctx => ` ${minutesToHhMm(ctx.parsed)}` }
                },
                centerText: {
                    line1: minutesToHhMm(totalTipoMin),
                    line2: 'total'
                }
            }
        }
    });

    const legendA = document.getElementById('donutTipoLegend');
    legendA.innerHTML = tipoSorted.length === 0
        ? '<div class="empty-state" style="padding:8px 0">Sin datos</div>'
        : tipoSorted.map(([tipo, min], i) => {
            const pct = totalTipoMin > 0 ? Math.round((min / totalTipoMin) * 100) : 0;
            return `<div class="donut-legend-item">
                <span class="donut-color-dot" style="background:${tipoColors[i]}"></span>
                <span class="donut-label-name" title="${_esc(tipo)}">${_esc(tipo)}</span>
                <span class="donut-label-time">${minutesToHhMm(min)}</span>
                <span class="donut-label-pct">${pct}%</span>
            </div>`;
        }).join('');

    // ── Donut B: con demora vs sin demora ──
    const withDelay    = rows.filter(r => r.demoraMinutes > 0).length;
    const withoutDelay = rows.length - withDelay;
    const pctSin = rows.length > 0 ? Math.round((withoutDelay / rows.length) * 100) : 0;
    const pctCon = 100 - pctSin;

    if (donutStatusInstance) donutStatusInstance.destroy();
    const ctxB = document.getElementById('donutStatusChart').getContext('2d');
    donutStatusInstance = new Chart(ctxB, {
        type: 'doughnut',
        plugins: [centerTextPlugin],
        data: {
            labels: ['Con demora', 'Sin demora'],
            datasets: [{
                data: [withDelay, withoutDelay],
                backgroundColor: ['#EF4444', '#10B981'],
                borderWidth: 2,
                borderColor: '#ffffff',
                hoverBorderColor: '#ffffff',
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '68%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1f2937',
                    callbacks: { label: ctx => ` ${ctx.parsed} registros` }
                },
                centerText: { line1: `${pctSin}%`, line2: 'sin demora' }
            }
        }
    });

    document.getElementById('donutStatusLegend').innerHTML = `
        <div class="donut-legend-item">
            <span class="donut-color-dot" style="background:#EF4444"></span>
            <span class="donut-label-name">Con demora</span>
            <span class="donut-label-time">${withDelay} reg.</span>
            <span class="donut-label-pct">${pctCon}%</span>
        </div>
        <div class="donut-legend-item">
            <span class="donut-color-dot" style="background:#10B981"></span>
            <span class="donut-label-name">Sin demora</span>
            <span class="donut-label-time">${withoutDelay} reg.</span>
            <span class="donut-label-pct">${pctSin}%</span>
        </div>`;
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

    const rangeFrom = firstDayOfMonth(months[0].year, months[0].month);
    const rangeTo   = lastDayOfMonth(months[months.length - 1].year, months[months.length - 1].month);
    const allRows   = await fetchRangeData(rangeFrom, rangeTo);

    const byMonth = {};
    months.forEach(m => {
        byMonth[`${m.year}-${String(m.month).padStart(2, '0')}`] = 0;
    });
    allRows.forEach(r => {
        const key = (r.fecha || '').substring(0, 7);
        if (key in byMonth && r.demoraMinutes > 0) byMonth[key] += r.demoraMinutes;
    });

    const labels = months.map(m => MONTH_NAMES_ES[m.month - 1]);
    const values = months.map(m => byMonth[`${m.year}-${String(m.month).padStart(2, '0')}`] || 0);

    // Derived stats for visual decoration
    const nonZero  = values.filter(v => v > 0);
    const avg      = nonZero.length > 0 ? nonZero.reduce((s, v) => s + v, 0) / nonZero.length : 0;
    const maxVal   = Math.max(...values);
    const minNonZ  = nonZero.length > 0 ? Math.min(...nonZero) : 0;

    // Per-point colors: red if above avg, green if below, blue otherwise
    const pointColors = values.map(v => {
        if (v === 0) return '#d1d5db';
        if (v === maxVal) return '#ef4444';
        if (v <= minNonZ && minNonZ < avg) return '#10b981';
        if (v > avg) return '#f97316';
        return '#3b82f6';
    });

    // Per-point radius: larger for peak and minimum
    const pointRadii = values.map(v => {
        if (v === maxVal || (v === minNonZ && minNonZ > 0)) return 7;
        if (v === 0) return 3;
        return 4.5;
    });

    const ctx = document.getElementById('trendChart').getContext('2d');
    if (trendChartInstance) trendChartInstance.destroy();

    // Gradient fill
    const gradient = ctx.createLinearGradient(0, 0, 0, 200);
    gradient.addColorStop(0, 'rgba(59,130,246,0.18)');
    gradient.addColorStop(1, 'rgba(59,130,246,0)');

    // Average line dataset (flat)
    const avgDataset = avg > 0 ? [{
        label: 'Promedio',
        data: values.map(() => avg),
        borderColor: 'rgba(156,163,175,0.6)',
        borderWidth: 1.5,
        borderDash: [5, 4],
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: false,
        tension: 0,
        order: 1,
    }] : [];

    trendChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Demora acumulada',
                    data: values,
                    borderColor: '#3b82f6',
                    backgroundColor: gradient,
                    borderWidth: 2.5,
                    pointBackgroundColor: pointColors,
                    pointBorderColor: '#ffffff',
                    pointBorderWidth: 2,
                    pointRadius: pointRadii,
                    pointHoverRadius: pointRadii.map(r => r + 2),
                    tension: 0.4,
                    fill: true,
                    order: 0,
                },
                ...avgDataset,
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1f2937',
                    titleColor: '#f9fafb',
                    bodyColor: '#d1d5db',
                    padding: 12,
                    cornerRadius: 8,
                    boxPadding: 4,
                    callbacks: {
                        title: ctx => ctx[0].label,
                        label: ctx => {
                            if (ctx.datasetIndex === 1) return `  Promedio: ${minutesToHhMm(ctx.parsed.y)}`;
                            const v    = ctx.parsed.y;
                            const prev = values[ctx.dataIndex - 1];
                            let delta  = '';
                            if (ctx.dataIndex > 0 && prev !== undefined) {
                                const diff = v - prev;
                                delta = diff > 0
                                    ? `  ▲ +${minutesToHhMm(diff)} vs ${labels[ctx.dataIndex - 1]}`
                                    : diff < 0
                                        ? `  ▼ ${minutesToHhMm(Math.abs(diff))} vs ${labels[ctx.dataIndex - 1]}`
                                        : '';
                            }
                            const base = `  ${minutesToHhMm(v)}`;
                            return delta ? [base, delta] : base;
                        },
                        afterBody: ctx => {
                            const v = ctx[0]?.parsed.y;
                            if (!avg || ctx[0]?.datasetIndex === 1) return [];
                            if (v === maxVal) return ['  ↑ Pico máximo del período'];
                            if (v === minNonZ && minNonZ < avg) return ['  ↓ Mínimo del período'];
                            return [];
                        },
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
                    grid: { color: '#f8f9fa', lineWidth: 1 },
                    ticks: {
                        font: { size: 11 },
                        color: '#9ca3af',
                        callback: v => minutesToHhMm(v),
                        maxTicksLimit: 6,
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

    // Aggregate by motivoDemora
    const map = {};
    withDelay.forEach(r => {
        const key = r.motivoDemora.trim();
        if (!map[key]) map[key] = { motivo: key, totalMin: 0 };
        map[key].totalMin += r.demoraMinutes;
    });

    const sorted = Object.values(map).sort((a, b) => b.totalMin - a.totalMin).slice(0, 5);
    const maxMin = sorted[0]?.totalMin || 1;

    // Rank-based list with progress bars and time pills
    const rankClasses = ['rank-1', 'rank-2', 'rank-3', '', ''];
    const rowsHtml = sorted.map((item, idx) => {
        const ratio    = item.totalMin / maxMin;
        const barW     = Math.round(ratio * 100);
        const rankCls  = rankClasses[idx] || '';
        return `
        <div class="motivo-list-item">
            <div class="motivo-rank-badge ${rankCls}">${idx + 1}</div>
            <div class="motivo-main">
                <div class="motivo-main-text" title="${_esc(item.motivo)}">${_esc(item.motivo)}</div>
                <div class="motivo-bar-track">
                    <div class="motivo-bar-fill" style="width:${barW}%"></div>
                </div>
            </div>
            <div class="motivo-tiempo-pill">${minutesToHhMm(item.totalMin)}</div>
        </div>`;
    }).join('');

    container.innerHTML = `<div class="motivo-list">${rowsHtml}</div>`;
}

// ── AI Insight ────────────────────────────────────────────────────────────────
async function renderAIInsight(rows, kpis, from, to) {
    const aiBody      = document.getElementById('aiBody');
    const aiCacheNote = document.getElementById('aiCacheNote');
    const cacheKey    = `sqr_ai_insight_v2_${from}_${to}`;

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

    const kpisTexto = `KPIs del período (${periodLabel}):
- Total registros: ${kpis.total}
- Registros con demora: ${kpis.withDelayCount} (${kpis.pctDelay}% del total)
- Tiempo acumulado de demoras: ${minutesToHhMm(kpis.acumMinutes)}
- Promedio de demora (solo con demora): ${minutesToHhMm(kpis.avgMinutes)}`;

    const demorasTexto = detailList || 'Sin registros con demora.';

    try {
        const resp = await fetch('/api/insight', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kpis: kpisTexto, demoras: demorasTexto }),
        });

        if (!resp.ok) {
            const errData = await resp.json().catch(() => ({}));
            throw new Error(`${resp.status} — ${errData.error || 'error desconocido'}${errData.detail ? ': ' + errData.detail : ''}`);
        }
        const data = await resp.json();
        const text = data.insight;

        localStorage.setItem(cacheKey, JSON.stringify({ text, ts: Date.now() }));
        aiBody.textContent = text;
        aiCacheNote.textContent = 'Generado ahora · válido 6 horas';
    } catch (err) {
        console.error('AI Insight error:', err);
        aiBody.textContent = 'No se pudo generar el análisis.';
        aiCacheNote.textContent = `Error: ${err.message}`;
        // Do NOT cache errors — next page load will retry automatically
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

    // Update date pickers
    if (_pickerFrom) _pickerFrom.setValue(from);
    if (_pickerTo)   _pickerTo.setValue(to);

    // Highlight active pill
    const active = detectShortcut(from, to);
    document.querySelectorAll('.shortcut-pill').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.shortcut === active);
    });

    // Update dynamic labels
    const periodLabel = buildSubtitle(from, to);
    const el = document.getElementById('topMotivosPeriod');
    if (el) el.textContent = periodLabel;

    // KPI skeleton + button loading state
    const btnApply = document.getElementById('btnApply');
    if (btnApply) { btnApply.disabled = true; btnApply.classList.add('loading'); }
    document.querySelectorAll('.kpi-value').forEach(v => { v.classList.add('skeleton'); v.textContent = ''; });

    // Fetch current range + previous period in parallel
    try {
        const prev = prevPeriodRange(from, to);
        const [currentRows, prevRows] = await Promise.all([
            fetchRangeData(from, to),
            fetchRangeData(prev.from, prev.to),
        ]);

        const kpis     = calcKPIs(currentRows);
        const prevKpis = calcKPIs(prevRows);

        const prevLabel = buildPrevPeriodLabel(from, to);
        renderKPIs(kpis, prevKpis, prevLabel);
        renderDonutCharts(currentRows);
        renderTopMotivos(currentRows);
        await renderAIInsight(currentRows, kpis, from, to);
    } catch (err) {
        console.error('[applyFilter] Error cargando datos:', err);
        document.getElementById('topMotivosContainer').innerHTML =
            `<div class="empty-state"><span class="es-icon">⚠️</span>Error al cargar datos.<br><small style="color:#9CA3AF">${err.message}</small></div>`;
        document.querySelectorAll('.kpi-value').forEach(el => { el.classList.remove('skeleton'); el.textContent = '—'; });
        document.getElementById('aiCacheNote').textContent = `Error: ${err.message}`;
        document.getElementById('aiBody').textContent = 'No se pudieron cargar los datos.';
    } finally {
        if (btnApply) { btnApply.disabled = false; btnApply.classList.remove('loading'); }
    }
}

// ── Filter UI wiring ──────────────────────────────────────────────────────────
function initFilter() {
    const now   = new Date();
    const year  = now.getFullYear();
    const month = now.getMonth() + 1;

    // Default: current month
    activeFrom = firstDayOfMonth(year, month);
    activeTo   = lastDayOfMonth(year, month);

    // Initialize custom day pickers
    _pickerFrom = _createDayPicker({ wrapperId: 'pickerFrom', hiddenInputId: 'inputFrom', displayId: 'displayFrom', triggerId: 'triggerFrom' });
    _pickerTo   = _createDayPicker({ wrapperId: 'pickerTo',   hiddenInputId: 'inputTo',   displayId: 'displayTo',   triggerId: 'triggerTo'   });

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

    // AI regenerate button
    document.getElementById('btnRegenAI')?.addEventListener('click', () => {
        const btn = document.getElementById('btnRegenAI');
        btn.classList.add('spinning');
        localStorage.removeItem(`sqr_ai_insight_v2_${activeFrom}_${activeTo}`);
        fetchRangeData(activeFrom, activeTo)
            .then(rows => renderAIInsight(rows, calcKPIs(rows), activeFrom, activeTo))
            .finally(() => btn.classList.remove('spinning'));
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

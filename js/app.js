// Configuración Global
const TOLERANCIA_MINUTOS = 3;

// ── Custom Day Picker ─────────────────────────────────────────────────────────
const _CDP_MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function _cdpToYMD(date) { return date.toISOString().slice(0, 10); }

function _createDayPicker({ wrapperId, hiddenInputId, displayId, triggerId }) {
    const wrapper   = document.getElementById(wrapperId);
    const triggerEl = document.getElementById(triggerId);
    const displayEl = document.getElementById(displayId);
    const hiddenEl  = document.getElementById(hiddenInputId);

    let viewYear     = new Date().getFullYear();
    let viewMonth    = new Date().getMonth() + 1;
    let selectedDate = null;

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

    function _renderCalendar() {
        monthLabel.textContent = _CDP_MONTHS[viewMonth - 1] + ' ' + viewYear;
        const firstDayJS  = new Date(viewYear, viewMonth - 1, 1).getDay();
        const startOffset = (firstDayJS + 6) % 7; // Mon=0
        const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
        const today       = _cdpToYMD(new Date());
        let html = '';
        for (let i = 0; i < startOffset; i++) html += `<button class="cdp-day" disabled></button>`;
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
        _renderCalendar();
    }

    function _clear() {
        selectedDate          = null;
        hiddenEl.value        = '';
        displayEl.textContent = 'dd/mm/aaaa';
        _renderCalendar();
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

    triggerEl.addEventListener('click', e => { e.stopPropagation(); dropdown.classList.contains('open') ? _close() : _open(); });
    dropdown.querySelector('.cdp-prev').addEventListener('click', e => { e.stopPropagation(); if (--viewMonth < 1) { viewMonth = 12; viewYear--; } _renderCalendar(); });
    dropdown.querySelector('.cdp-next').addEventListener('click', e => { e.stopPropagation(); if (++viewMonth > 12) { viewMonth = 1; viewYear++; } _renderCalendar(); });
    dropdown.querySelector('.cdp-btn-clear').addEventListener('click', e => { e.stopPropagation(); _clear(); _close(); });
    dropdown.querySelector('.cdp-btn-today').addEventListener('click', e => {
        e.stopPropagation();
        const t = _cdpToYMD(new Date());
        viewYear = +t.split('-')[0]; viewMonth = +t.split('-')[1];
        _select(t); _close();
    });
    document.addEventListener('click', e => { if (!wrapper.contains(e.target)) _close(); });
    _renderCalendar();

    return {
        setValue(ds) {
            if (ds) {
                viewYear  = +ds.split('-')[0];
                viewMonth = +ds.split('-')[1];
                _select(ds);
            } else {
                _clear();
            }
        },
        close: _close,
    };
}

// Picker instance for the add/edit modal
let _modalDatePicker = null;

function _initModalDatePicker() {
    if (_modalDatePicker) return; // already initialised
    _modalDatePicker = _createDayPicker({
        wrapperId:     'modalDatePicker',
        hiddenInputId: 'addFecha',
        displayId:     'modalDateDisplay',
        triggerId:     'modalDateTrigger',
    });
}

// ── Animación count-up (compartida por todas las páginas) ─────────────────────
function animateValue(element, start, end, duration, formatter) {
    const startTime = performance.now();
    function update(currentTime) {
        const elapsed  = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased    = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        element.textContent = formatter(start + (end - start) * eased);
        if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
}
let chartInstance = null;
let currentEditIndex = null;
let sortState = {
    column: 'fecha',
    direction: 'asc'
};

// --- Motor de Notificaciones (Toasts) ---
function showToast(message, type = 'success') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    const icon = type === 'success' ? '✅' : '❌';

    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <span class="toast-msg">${message}</span>
    `;

    container.appendChild(toast);

    // Animación de entrada
    setTimeout(() => toast.classList.add('show'), 100);

    // Auto-eliminar después de 4 segundos
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 500);
    }, 4000);
}

// Funciones de utilidad para tiempo
function timeToMinutes(timeStr) {
    if (!timeStr || timeStr === "0:00" || timeStr === "00:00:00") return 0;
    const parts = timeStr.split(':');
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

function minutesToHHMM(mins) {
    if (mins === 0) return "00:00";
    const isNegative = mins < 0;
    const absMins = Math.abs(mins);
    const h = Math.floor(absMins / 60);
    const m = absMins % 60;
    return `${isNegative ? '-' : ''}${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function calculateStatus(item) {
    if (item.manualOverride) return "OK";

    // Usar HorarioSinDemora (Efectivo) en lugar de HorarioReal
    const effectiveTime = timeToMinutes(item.horarioSindemora);
    const min = timeToMinutes(item.horaMin);
    const max = timeToMinutes(item.horaMax);

    if (effectiveTime === 0 && min === 0) return "OK";

    // Si el tiempo efectivo está en el rango
    if (effectiveTime >= min && effectiveTime <= max) return "OK";

    // Tolerancia: si está fuera por menos de TOLERANCIA_MINUTOS
    if (effectiveTime > max && (effectiveTime - max) <= TOLERANCIA_MINUTOS) return "OK";
    if (effectiveTime < min && (min - effectiveTime) <= TOLERANCIA_MINUTOS) return "OK";

    return "FUERA";
}

async function fetchProjections() {
    addLog("Inicializando motor de predicción...", "info");
    try {
        const { data, error } = await supabaseClient
            .from('Estimacion')
            .select('*');

        if (error) {
            console.error('Error de Supabase:', error);
            addLog("Error en conexión con base de datos.", "error");
            throw error;
        }

        addLog(`Datos cargados: ${data ? data.length : 0} registros.`, "info");
        
        if (data && data.length > 0) {
            console.log("Estructura del primer registro:", Object.keys(data[0]));
            addLog(`Columnas detectadas: ${Object.keys(data[0]).join(', ')}`, "info");
        } else {
            console.warn("⚠️ La tabla 'Estimacion' está devolviendo 0 registros.");
            alert("La base de datos devolvió 0 registros. Es muy probable que necesites configurar una política RLS en Supabase (Enable read access for all users) para que los datos sean visibles.");
            return;
        }

        // Mapeo de PascalCase (Supabase) a camelCase (Lógica JS)
        window.projectionData = data.map(item => {
            let normalizedDate = item.Fecha || '';

            // Si la fecha está en formato DD/MM/YYYY, convertir a YYYY-MM-DD
            if (normalizedDate.includes('/')) {
                const parts = normalizedDate.split('/');
                if (parts.length === 3) {
                    const d = parts[0].padStart(2, '0');
                    const m = parts[1].padStart(2, '0');
                    const y = parts[2];
                    normalizedDate = `${y}-${m}-${d}`;
                }
            }

            // Limpieza de caracteres especiales (ej: Da -> Día, Hbil -> Hábil)
            let cleanTipo = (item.Tipo || 'Normal').replace(/D[íì]?a/g, 'Día').replace(/H[áà]?bil/g, 'Hábil');
            // Si el texto es literal "Da"
            if (cleanTipo === "Da") cleanTipo = "Día";
            if (cleanTipo.startsWith("D a")) cleanTipo = cleanTipo.replace("D a", "Día");

            // Función interna para forzar formato HH:MM o HH:MM:SS
            const cleanTime = (t, keepSeconds = false) => {
                if (!t) return keepSeconds ? "00:00:00" : "00:00";
                const p = t.toString().split(':');
                if (p.length >= 2) {
                    const hh = p[0].padStart(2, '0');
                    const mm = p[1].padStart(2, '0');
                    if (keepSeconds) {
                        const ss = (p[2] || '00').padStart(2, '0');
                        return `${hh}:${mm}:${ss}`;
                    }
                    return `${hh}:${mm}`;
                }
                return t;
            };

            // Identificar el ID de forma robusta
            let recordId = null;
            let idSource = '';

            if (item.id !== undefined) { recordId = item.id; idSource = 'id'; }
            else if (item.ID !== undefined) { recordId = item.ID; idSource = 'ID'; }
            else if (item.Id !== undefined) { recordId = item.Id; idSource = 'Id'; }
            else {
                // Si no hay id, buscamos cualquier llave que parezca un ID
                const idKey = Object.keys(item).find(k => k.toLowerCase() === 'id');
                if (idKey) {
                    recordId = item[idKey];
                    idSource = idKey;
                }
            }

            return {
                id: recordId,
                _idSource: idSource, // Guardamos la fuente para depuración
                fecha: normalizedDate,
                tipo: cleanTipo,
                diaSemana: item.DiaSemana,
                horaMin: cleanTime(item.HoraMin),
                horaMax: cleanTime(item.HoraMax),
                horarioReal: cleanTime(item.HorarioReal),
                demoras: cleanTime(item.Demoras, true), // KEEP SECONDS ONLY FOR DEMORAS
                horarioSindemora: cleanTime(item.HorarioSinDemora), // Reverted to singular as per schema log
                franjaSLO: cleanTime(item.FranjaSLO),
                motivo: item.MotivoDemora || '',
                manualOverride: item.manualOverride || false
            };
        });

        addLog("Escaneando desviaciones críticas...", "info");
        updateDashboard();
    } catch (err) {
        console.error('Error cargando datos de Supabase:', err);
        addLog("Fallo crítico en motor de sincronización.", "error");
        showToast('Error de conexión con la base de datos.', 'error');
    }
}

function updateDashboard() {
    if (!window.projectionData) return;

    const filterType = document.getElementById('filterType').value;
    const filterMonth = document.getElementById('filterMonth').value;

    saveFilters(filterMonth, filterType);

    let filteredData = window.projectionData.filter(item => {
        const typeMatch = filterType === 'all' || (item.tipo && item.tipo.includes(filterType));
        const monthMatch = item.fecha && item.fecha.startsWith(filterMonth);
        return typeMatch && monthMatch;
    });

    filteredData = sortData(filteredData);

    if (document.getElementById('dataTableBody')) renderTable(filteredData);
    if (document.getElementById('avgEffectiveness')) renderStats(filteredData);
    if (document.getElementById('trendChart')) renderChart(filteredData);
    if (document.getElementById('aiInsights')) updateAIInsights(filteredData);
    if (document.getElementById('riskBanner')) updateRiskPrediction();

    if (document.getElementById('riskHeatmap')) {
        updateHeatmap(window.projectionData);
    }
    if (document.getElementById('monitoringTrendChart')) {
        renderMonitoringTrend(filteredData);
    }
    if (document.getElementById('monitoringAlerts')) {
        updateMonitoringAlerts(filteredData);
    }

    if (document.getElementById('monitoringGroups')) {
        const prevMonth = getPreviousMonth(filterMonth);
        renderMonitoringPage(filterMonth, prevMonth);
    }

    // Actualizar Alerta Dinámica en el Header (Toolbar)
    const statusAlert = document.getElementById('dynamicStatusAlert');
    if (statusAlert) {
        if (filteredData.length === 0) {
            statusAlert.style.display = 'none';
        } else {
            const failsCount = filteredData.filter(item => calculateStatus(item) === 'FUERA').length;
            if (failsCount > 0) {
                statusAlert.className = 'status-pill status-pill-fail';
                statusAlert.innerHTML = `⚠️ ${failsCount} ${failsCount === 1 ? 'día' : 'días'} fuera de proyección`;
            } else {
                statusAlert.className = 'status-pill status-pill-ok';
                statusAlert.innerHTML = `✓ Todos los días en proyección`;
            }
            statusAlert.style.display = 'flex';
        }
    }
}

function addLog(msg, type = 'info') {
    const logContainer = document.getElementById('systemLog');
    if (!logContainer) return;

    const now = new Date();
    const ts = now.toTimeString().split(' ')[0];

    const line = document.createElement('div');
    line.className = 'log-line';
    line.innerHTML = `
        <span class="log-timestamp">${ts}</span>
        <div class="log-msg">> ${msg}</div>
    `;

    logContainer.prepend(line);
    if (logContainer.children.length > 20) logContainer.removeChild(logContainer.lastChild);
}

function updateMonitoringAlerts(data) {
    const container = document.getElementById('monitoringAlerts');
    if (!container) return;

    const criticalFails = data.filter(item => {
        const status = calculateStatus(item);
        if (status === 'FUERA') {
            const real = timeToMinutes(item.horarioReal);
            const max = timeToMinutes(item.horaMax);
            return (real - max) > 30; // Desvío crítico > 30 min
        }
        return false;
    });

    let html = `
        <div class="alert-item alert-info">
            [INFO] Análisis completado. ${data.length} registros evaluados satisfactoriamente.
        </div>
    `;

    if (criticalFails.length > 0) {
        html += `
            <div class="alert-item alert-warning">
                [WARN] Detectados ${criticalFails.length} incidentes con desvío mayor a 30 min en el periodo.
            </div>
        `;
    }

    const patterns = {};
    data.forEach(item => {
        if (calculateStatus(item) === 'FUERA') {
            const key = item.diaSemana;
            patterns[key] = (patterns[key] || 0) + 1;
        }
    });

    for (const day in patterns) {
        if (patterns[day] >= 2) {
            html += `
                <div class="alert-item alert-warning">
                    [WARN] Patrón de falla recurrente los días ${day} (${patterns[day]} muestras).
                </div>
            `;
        }
    }

    container.innerHTML = html;
}

function updateRiskPrediction() {
    if (!window.projectionData || window.projectionData.length === 0) return;

    const banner = document.getElementById('riskBanner');

    // Calcular "Mañana"
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const tomorrowDayName = days[tomorrow.getDay()];

    // Para simplificar, asumimos que mañana es tipo "Normal" a menos que sea fin de semana
    const tomorrowType = (tomorrow.getDay() === 0 || tomorrow.getDay() === 6) ? 'Feriado' : 'Normal';

    // Buscar histórico para ese mismo día y tipo
    const historical = window.projectionData.filter(item =>
        item.diaSemana === tomorrowDayName && item.tipo.includes(tomorrowType)
    );

    if (historical.length === 0) {
        banner.style.display = 'none';
        return;
    }

    const total = historical.length;
    const fails = historical.filter(item => calculateStatus(item) === "FUERA").length;
    const riskProb = ((fails / total) * 100).toFixed(0);

    // Desvío promedio cuando falla
    const failRecords = historical.filter(item => calculateStatus(item) === "FUERA");
    let avgFailMinutes = 0;
    if (failRecords.length > 0) {
        const totalFailMin = failRecords.reduce((acc, item) => {
            // Cálculo del desvío basado en HorarioSinDemora vs HoraMax
            const effectiveTime = timeToMinutes(item.horarioSindemora);
            const maxTime = timeToMinutes(item.horaMax);
            return acc + (effectiveTime - maxTime);
        }, 0);
        avgFailMinutes = Math.round(totalFailMin / failRecords.length);
    }

    banner.className = 'risk-banner';
    let icon = '✔';
    let title = 'Riesgo Bajo';

    if (riskProb > 60) {
        banner.classList.add('risk-high');
        icon = '🚀';
        title = 'Riesgo Alto';
    } else if (riskProb > 20) {
        banner.classList.add('risk-medium');
        icon = '⚠️';
        title = 'Riesgo Medio';
    } else {
        banner.classList.add('risk-low');
    }

    const isAdvance = avgFailMinutes < 0;
    const absMinutes = Math.abs(avgFailMinutes);
    const timeStr = minutesToHHMM(absMinutes);

    banner.innerHTML = `
        <div class="risk-icon">${icon}</div>
        <div class="risk-content">
            <div class="risk-title">${title}: Mañana es ${tomorrowDayName} (${tomorrowType})</div>
            <div class="risk-desc">Análisis histórico sugiere un <strong>${isAdvance ? 'adelanto' : 'desvío'}</strong> de <strong style="color: inherit;">${timeStr}</strong> (${riskProb}% de probabilidad) para este tipo de jornada.</div>
        </div>
    `;
    banner.style.display = 'flex';
}

// ─── PDF helpers ────────────────────────────────────────────────────────────

function classifyStatusPDF(item) {
    if (item.manualOverride) return 'OK';
    const eff = timeToMinutes(item.horarioSindemora);
    const min = timeToMinutes(item.horaMin);
    const max = timeToMinutes(item.horaMax);
    if (eff === 0 && min === 0) return 'OK';
    if (eff >= min && eff <= max) return 'OK';
    if (eff > max && (eff - max) <= TOLERANCIA_MINUTOS) return 'OK';
    if (eff < min && (min - eff) <= TOLERANCIA_MINUTOS) return 'OK';
    return eff > max ? 'FUERA_DEMORA' : 'FUERA_ADELANTO';
}

function pdfMinsToHHMM(mins) {
    if (mins == null || isNaN(mins) || mins < 0) return '00:00';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function safeStr(str) {
    if (!str) return '';
    // Fix mojibake: UTF-8 bytes misread as Latin-1 code points
    return str.normalize('NFC')
        .replace(/\u00c3\u00a1/g, '\u00e1') // á
        .replace(/\u00c3\u00a9/g, '\u00e9') // é
        .replace(/\u00c3\u00ad/g, '\u00ed') // í
        .replace(/\u00c3\u00b3/g, '\u00f3') // ó
        .replace(/\u00c3\u00ba/g, '\u00fa') // ú
        .replace(/\u00c3\u00b1/g, '\u00f1') // ñ
        .replace(/\u00c3\u0081/g, '\u00c1') // Á
        .replace(/\u00c3\u0089/g, '\u00c9') // É
        .replace(/\u00c3\u0093/g, '\u00d3') // Ó
        .replace(/\u00c3\u009a/g, '\u00da') // Ú
        .replace(/\u00c3\u0091/g, '\u00d1'); // Ñ
}

function parseCriticalPathMinutes(motivo) {
    if (!motivo) return 0;
    const m = motivo.match(/[Dd]emora total[^:]*:\s*(\d+)\s*min/);
    return m ? parseInt(m[1], 10) : 0;
}

function extractProcessesFromMotivo(motivo, fecha) {
    if (!motivo) return [];
    const results = [];
    const re = /El proceso\s+(\d+)\s*[-\u2013]\s*([^\(]+?)(?:\s*\([^\)]*\))?\s*finaliz/gi;
    let match;
    while ((match = re.exec(motivo)) !== null) {
        const id = match[1];
        const name = match[2].trim();
        const after = motivo.slice(match.index);
        const imp = after.match(/afect[oó] al camino cr[ií]tico\s+(\d+)\s*min/i);
        results.push({ id, name, fecha, impact: imp ? parseInt(imp[1], 10) : 0 });
    }
    return results;
}

// Genera un SVG del gráfico de forma stateless (sin dependencias de charting).
// Equivalente directo a build_chart_svg() de la especificación Python/ReportLab.
function buildChartSVG(data, width = 520, height = 220) {
    const ML = 45, MT = 15, MR = 20, MB = 35;
    const x0 = ML, y0 = MT, x1 = width - MR, y1 = height - MB;
    const n = data.length;

    if (n === 0) {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"></svg>`;
    }

    const classified = data.map(d => ({ ...d, _status: classifyStatusPDF(d) }));
    const realVals    = data.map(d => timeToMinutes(d.horarioReal));
    const projMinVals = data.map(d => timeToMinutes(d.horaMin));
    const projMaxVals = data.map(d => timeToMinutes(d.horaMax));

    // Y range — rounded to multiples of 30
    const allVals = [...realVals, ...projMinVals, ...projMaxVals].filter(v => v > 0);
    let yMin = Math.floor((Math.min(...allVals) - 20) / 30) * 30;
    let yMax = Math.ceil((Math.max(...allVals) + 20) / 30) * 30;
    if (yMin === yMax) { yMin -= 30; yMax += 30; }

    const mapX = i  => x0 + (n === 1 ? (x1 - x0) / 2 : i * (x1 - x0) / (n - 1));
    const mapY = v  => y1 - (v - yMin) / (yMax - yMin) * (y1 - y0);
    const fmt  = v  => { const h = Math.floor(v / 60); const m = v % 60; return `${h}:${m.toString().padStart(2, '0')}`; };
    const f1   = v  => v.toFixed(1);

    const parts = [];
    parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`);

    // 1. Horizontal grid lines
    for (let t = 0; t <= 4; t++) {
        const gy = f1(mapY(yMin + t * (yMax - yMin) / 4));
        parts.push(`<line x1="${x0}" y1="${gy}" x2="${x1}" y2="${gy}" stroke="#F0F0F0" stroke-width="1"/>`);
    }

    // 2. Band fill (proj range polygon)
    const bandPts = [
        ...projMinVals.map((v, i) => `${f1(mapX(i))},${f1(mapY(v))}`),
        ...[...projMaxVals].reverse().map((v, i) => `${f1(mapX(n - 1 - i))},${f1(mapY(v))}`),
    ].join(' ');
    parts.push(`<polygon points="${bandPts}" fill="#378ADD" fill-opacity="0.08" stroke="none"/>`);

    // 3. Band borders (dashed)
    const minPts = projMinVals.map((v, i) => `${f1(mapX(i))},${f1(mapY(v))}`).join(' ');
    const maxPts = projMaxVals.map((v, i) => `${f1(mapX(i))},${f1(mapY(v))}`).join(' ');
    parts.push(`<polyline points="${minPts}" fill="none" stroke="#85B7EB" stroke-width="1" stroke-dasharray="4 3" stroke-opacity="0.6"/>`);
    parts.push(`<polyline points="${maxPts}" fill="none" stroke="#85B7EB" stroke-width="1" stroke-dasharray="4 3" stroke-opacity="0.6"/>`);

    // 4. Real line — smooth cubic bezier
    const pts = realVals.map((v, i) => ({ x: mapX(i), y: mapY(v) }));
    let pathD = `M ${f1(pts[0].x)},${f1(pts[0].y)}`;
    for (let i = 1; i < pts.length; i++) {
        const pp = pts[Math.max(0, i - 2)];
        const p0 = pts[i - 1];
        const p1 = pts[i];
        const p2 = pts[Math.min(pts.length - 1, i + 1)];
        const cp1x = p0.x + (p1.x - pp.x) * 0.2;
        const cp1y = p0.y + (p1.y - pp.y) * 0.2;
        const cp2x = p1.x - (p2.x - p0.x) * 0.2;
        const cp2y = p1.y - (p2.y - p0.y) * 0.2;
        pathD += ` C ${f1(cp1x)},${f1(cp1y)} ${f1(cp2x)},${f1(cp2y)} ${f1(p1.x)},${f1(p1.y)}`;
    }
    parts.push(`<path d="${pathD}" stroke="#378ADD" stroke-width="2" fill="none" stroke-linejoin="round"/>`);

    // 5. Points colored by status
    const PT_COLORS = { OK: '#22c55e', FUERA_DEMORA: '#E24B4A', FUERA_ADELANTO: '#EF9F27' };
    classified.forEach((item, i) => {
        const color = PT_COLORS[item._status] || '#22c55e';
        parts.push(`<circle cx="${f1(mapX(i))}" cy="${f1(mapY(realVals[i]))}" r="5.5" fill="${color}" stroke="#FFFFFF" stroke-width="2"/>`);
    });

    // 6. X axis labels (day number)
    data.forEach((item, i) => {
        parts.push(`<text x="${f1(mapX(i))}" y="${f1(y1 + 18)}" font-size="10" fill="#999999" text-anchor="middle" font-family="Helvetica">${item.fecha.split('-')[2]}</text>`);
    });

    // 7. Y axis ticks
    for (let t = 0; t <= 4; t++) {
        const v  = yMin + t * (yMax - yMin) / 4;
        const ty = f1(mapY(v));
        parts.push(`<text x="${f1(x0 - 8)}" y="${ty}" font-size="10" fill="#999999" text-anchor="end" font-family="Helvetica" dominant-baseline="middle">${fmt(v)}</text>`);
    }

    // 8. Legend — centered at bottom
    const legendDefs = [
        { color: '#22c55e', label: 'Ejecuci\u00f3n real',  w: 94 },
        { color: '#E24B4A', label: 'FUERA (demora)',        w: 88 },
        { color: '#EF9F27', label: 'FUERA (adelanto)',      w: 96 },
    ];
    const legendGap   = 20;
    const legendTotalW = legendDefs.reduce((s, d) => s + d.w, 0) + legendGap * (legendDefs.length - 1);
    let lx = (width - legendTotalW) / 2;
    const ly = height - 6;
    legendDefs.forEach(item => {
        parts.push(`<circle cx="${f1(lx + 4)}" cy="${f1(ly - 3)}" r="4" fill="${item.color}"/>`);
        parts.push(`<text x="${f1(lx + 12)}" y="${ly}" font-size="10" fill="#666666" font-family="Helvetica">${item.label}</text>`);
        lx += item.w + legendGap;
    });

    parts.push('</svg>');
    return parts.join('\n');
}

// Convierte el SVG generado en una imagen PNG lista para jsPDF.
// Usa el renderer SVG nativo del browser vía un elemento Image.
function generatePDFChartImage(data, classified) {
    const svgString = buildChartSVG(data);
    return new Promise((resolve, reject) => {
        const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const url  = URL.createObjectURL(blob);
        const img  = new Image();
        img.onload = () => {
            const scale  = 2; // 2× para calidad retina
            const canvas = document.createElement('canvas');
            canvas.width  = 520 * scale;
            canvas.height = 220 * scale;
            const ctx = canvas.getContext('2d');
            ctx.scale(scale, scale);
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, 520, 220);
            ctx.drawImage(img, 0, 0, 520, 220);
            URL.revokeObjectURL(url);
            resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = e => { URL.revokeObjectURL(url); reject(e); };
        img.src = url;
    });
}

// ─── Main PDF generator ──────────────────────────────────────────────────────

async function generatePDFReport() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');

    const btn = document.querySelector('.btn-pdf');
    const originalText = btn.innerHTML;
    btn.innerHTML = '⏳ Generando...';
    btn.disabled = true;

    try {
        const data = window.currentChartData || [];
        const pdfWidth  = doc.internal.pageSize.getWidth();  // 210
        const pdfHeight = doc.internal.pageSize.getHeight(); // 297
        const margin = 16;
        const contentW = pdfWidth - margin * 2;

        // ── Month / effectiveness ──────────────────────────────────────────
        const MONTHS = ['enero','febrero','marzo','abril','mayo','junio',
                        'julio','agosto','septiembre','octubre','noviembre','diciembre'];
        const filterMonthVal = document.getElementById('filterMonth').value;
        let mesNombre = '';
        if (filterMonthVal) {
            mesNombre = MONTHS[parseInt(filterMonthVal.split('-')[1], 10) - 1] || filterMonthVal;
        } else if (data.length > 0) {
            mesNombre = MONTHS[parseInt(data[0].fecha.split('-')[1], 10) - 1] || '';
        }

        const classified = data.map(item => ({ ...item, _status: classifyStatusPDF(item) }));
        const total         = classified.length;
        const okDays        = classified.filter(d => d._status === 'OK').length;
        const fueraDemora   = classified.filter(d => d._status === 'FUERA_DEMORA');
        const fueraAdelanto = classified.filter(d => d._status === 'FUERA_ADELANTO');
        const effectiveness = total > 0 ? ((okDays / total) * 100).toFixed(1) : '0.0';
        const effNum        = parseFloat(effectiveness);

        // ── Critical path analysis ─────────────────────────────────────────
        let totalCriticalMins = 0;
        const processMap = {};
        fueraDemora.forEach(item => {
            totalCriticalMins += parseCriticalPathMinutes(item.motivo);
            extractProcessesFromMotivo(item.motivo, item.fecha).forEach(p => {
                if (!processMap[p.id]) processMap[p.id] = { name: p.name, dates: [], totalImpact: 0 };
                processMap[p.id].dates.push(p.fecha);
                processMap[p.id].totalImpact += p.impact;
            });
        });
        const topProcess = Object.entries(processMap)
            .sort((a, b) => b[1].dates.length - a[1].dates.length)[0];

        // ── Pre-render chart ───────────────────────────────────────────────
        const chartImgData = await generatePDFChartImage(data, classified);

        // ════════════════════════════════════════════════════════════════════
        // PAGE CONTENT
        // ════════════════════════════════════════════════════════════════════

        let yPos = 20;

        // ── Title ──────────────────────────────────────────────────────────
        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(29, 29, 31);
        doc.text('Proyecci\u00f3n Mensual', margin, yPos);
        yPos += 5;
        doc.setDrawColor(220, 220, 220);
        doc.setLineWidth(0.4);
        doc.line(margin, yPos, pdfWidth - margin, yPos);
        yPos += 8;

        // ── Effectiveness subtitle (colored bold %) ────────────────────────
        let effR = 185, effG = 28, effB = 28;
        if (effNum >= 80) { effR = 21;  effG = 128; effB = 61; }
        else if (effNum >= 60) { effR = 180; effG = 83;  effB = 9; }

        doc.setFontSize(11);
        const p1 = 'La proyecci\u00f3n tuvo una eficacia de ';
        const p2 = effectiveness + '%';
        const p3 = ' el mes de ' + mesNombre + '.';
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        doc.text(p1, margin, yPos);
        const w1 = doc.getTextWidth(p1);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(effR, effG, effB);
        doc.text(p2, margin + w1, yPos);
        const w2 = doc.getTextWidth(p2);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(100, 100, 100);
        doc.text(p3, margin + w1 + w2, yPos);
        yPos += 10;

        // ── KPI cards ─────────────────────────────────────────────────────
        const cardW  = contentW / 4;
        const cardH  = 20;
        const cardGap = 3;

        const kpis = [
            {
                label: 'D\u00edas del mes',
                value: String(total),
                color: [29, 29, 31],
            },
            {
                label: 'D\u00edas OK',
                value: String(okDays),
                color: [21, 128, 61],
            },
            {
                label: 'D\u00edas FUERA',
                value: `${fueraDemora.length + fueraAdelanto.length}`,
                sub:   `${fueraDemora.length} demora  \u00b7  ${fueraAdelanto.length} adelanto`,
                color: fueraDemora.length > 0 ? [185, 28, 28] : [180, 83, 9],
            },
            {
                label: 'Demora cr\u00edtica acum.',
                value: totalCriticalMins > 0 ? `${totalCriticalMins} min` : (fueraDemora.length > 0 ? 'Ver motivos' : '\u2014'),
                color: [29, 29, 31],
            },
        ];

        kpis.forEach((kpi, i) => {
            const x = margin + i * (cardW + cardGap / 4);
            doc.setFillColor(248, 249, 250);
            doc.setDrawColor(220, 222, 225);
            doc.setLineWidth(0.3);
            doc.roundedRect(x, yPos, cardW - 1, cardH, 2, 2, 'FD');

            doc.setFontSize(7);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(130, 130, 130);
            doc.text(kpi.label, x + 4, yPos + 6);

            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...kpi.color);
            doc.text(kpi.value, x + 4, yPos + 14);

            if (kpi.sub) {
                doc.setFontSize(6.5);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(130, 130, 130);
                doc.text(kpi.sub, x + 4, yPos + 19);
            }
        });
        yPos += cardH + 8;

        // ── Chart ─────────────────────────────────────────────────────────
        const chartRenderH = 88;
        doc.addImage(chartImgData, 'PNG', margin, yPos, contentW, chartRenderH);
        yPos += chartRenderH + 6;

        // ── Main table ────────────────────────────────────────────────────
        if (data.length > 0) {
            // Demoras total row
            const totalDemoMins = classified.reduce((acc, d) => acc + timeToMinutes(d.demoras), 0);

            const tableBody = classified.map(item => [
                item.fecha,
                safeStr(item.tipo || ''),
                `${item.horaMin} - ${item.horaMax}`,
                item.horarioReal || '',
                item.demoras || '',
                item._status,   // used in hooks; text hidden, chip drawn
                safeStr(item.motivo && item.motivo.trim() ? item.motivo : '\u2014'),
            ]);
            // Totals row
            tableBody.push(['Total', '\u2014', '\u2014', '\u2014', pdfMinsToHHMM(totalDemoMins), '_TOTAL_', '']);

            const totalRowIdx = tableBody.length - 1;

            doc.autoTable({
                head: [['Fecha', 'Tipo', 'Proyectado', 'Real', 'Demora', 'Estado', 'Motivo']],
                body: tableBody,
                startY: yPos,
                margin: { left: margin, right: margin, bottom: 14 },
                styles: {
                    fontSize: 7.5,
                    cellPadding: { top: 4, right: 3, bottom: 4, left: 3 },
                    textColor: [40, 40, 40],
                    lineColor: [225, 225, 225],
                    lineWidth: 0.25,
                    overflow: 'linebreak',
                    valign: 'middle',
                },
                headStyles: {
                    fillColor: [29, 29, 31],
                    textColor: [255, 255, 255],
                    fontStyle: 'bold',
                    fontSize: 7.5,
                    cellPadding: { top: 4, right: 3, bottom: 4, left: 3 },
                },
                columnStyles: {
                    0: { cellWidth: 22 },
                    1: { cellWidth: 22 },
                    2: { cellWidth: 26 },
                    3: { cellWidth: 19 },
                    4: { cellWidth: 19 },
                    5: { cellWidth: 20 },
                    6: { cellWidth: 'auto' },
                },
                didParseCell: function (d) {
                    if (d.section !== 'body') return;
                    const ri = d.row.index;

                    // Totals row
                    if (ri === totalRowIdx) {
                        d.cell.styles.fillColor  = [229, 231, 235];
                        d.cell.styles.fontStyle  = 'bold';
                        d.cell.styles.textColor  = [50, 50, 50];
                        return;
                    }

                    const item = classified[ri];
                    if (!item) return;
                    const st = item._status;

                    // Row background
                    if (st === 'FUERA_DEMORA') {
                        d.cell.styles.fillColor = [255, 241, 242];
                    } else if (st === 'FUERA_ADELANTO') {
                        d.cell.styles.fillColor = [255, 251, 235];
                    } else {
                        d.cell.styles.fillColor = ri % 2 === 0 ? [255, 255, 255] : [249, 250, 251];
                    }

                    // Demora column color scaling
                    if (d.column.index === 4) {
                        const dm = timeToMinutes(d.cell.raw);
                        if (dm === 0) {
                            d.cell.styles.textColor = [190, 190, 190];
                        } else if (dm <= 20) {
                            d.cell.styles.textColor = [21, 128, 61];
                        } else if (dm <= 60) {
                            d.cell.styles.textColor = [180, 83, 9];
                        } else {
                            d.cell.styles.textColor = [185, 28, 28];
                            d.cell.styles.fontStyle = 'bold';
                        }
                    }

                    // Status column: hide text (chip drawn in didDrawCell)
                    if (d.column.index === 5) {
                        d.cell.styles.textColor = d.cell.styles.fillColor;
                    }
                },
                didDrawCell: function (d) {
                    if (d.section !== 'body') return;
                    if (d.column.index !== 5) return;
                    const ri = d.row.index;
                    if (ri === totalRowIdx) return;

                    const item = classified[ri];
                    if (!item) return;
                    const st = item._status;

                    let chipR, chipG, chipB, chipLabel;
                    if (st === 'OK') {
                        chipR = 21; chipG = 128; chipB = 61; chipLabel = 'OK';
                    } else if (st === 'FUERA_DEMORA') {
                        chipR = 185; chipG = 28; chipB = 28; chipLabel = 'FUERA';
                    } else {
                        chipR = 180; chipG = 83; chipB = 9; chipLabel = 'ADELANTO';
                    }

                    const cx = d.cell.x + 2;
                    const cy = d.cell.y + 2;
                    const cw = d.cell.width - 4;
                    const ch = d.cell.height - 4;

                    doc.setFillColor(chipR, chipG, chipB);
                    doc.roundedRect(cx, cy, cw, ch, 1.5, 1.5, 'F');

                    doc.setFontSize(6.5);
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(255, 255, 255);
                    doc.text(chipLabel, cx + cw / 2, cy + ch / 2 + 1, { align: 'center' });
                },
            });

            yPos = doc.lastAutoTable.finalY + 10;

            // ── Problematic processes table ────────────────────────────────
            const processRows = Object.entries(processMap)
                .sort((a, b) => b[1].totalImpact - a[1].totalImpact);

            if (processRows.length > 0) {
                doc.setFontSize(11);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(29, 29, 31);
                doc.text('Procesos con incidencias en el mes', margin, yPos);
                yPos += 6;

                doc.autoTable({
                    head: [['Proceso', 'Nombre', 'Fecha(s)', 'Impacto camino cr\u00edtico']],
                    body: processRows.map(([id, info]) => [
                        `#${id}`,
                        safeStr(info.name),
                        info.dates.join(', '),
                        info.totalImpact > 0 ? `${info.totalImpact} min` : '\u2014',
                    ]),
                    startY: yPos,
                    margin: { left: margin, right: margin, bottom: 14 },
                    styles: {
                        fontSize: 7.5,
                        cellPadding: { top: 3.5, right: 3, bottom: 3.5, left: 3 },
                        textColor: [40, 40, 40],
                        lineColor: [225, 225, 225],
                        lineWidth: 0.25,
                        overflow: 'linebreak',
                    },
                    headStyles: {
                        fillColor: [29, 29, 31],
                        textColor: [255, 255, 255],
                        fontStyle: 'bold',
                        fontSize: 7.5,
                    },
                    alternateRowStyles: { fillColor: [249, 250, 251] },
                    columnStyles: {
                        0: { cellWidth: 18 },
                        1: { cellWidth: 60 },
                        2: { cellWidth: 40 },
                        3: { cellWidth: 'auto' },
                    },
                });
            }
        }

        // ── Footer (all pages) ─────────────────────────────────────────────
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(180, 180, 180);
            doc.text('SQR Tracker \u2013 Operaciones Bancarias', margin, pdfHeight - 8);
            doc.text(`P\u00e1gina ${i} de ${pageCount}`, pdfWidth - margin, pdfHeight - 8, { align: 'right' });
            doc.setDrawColor(220, 220, 220);
            doc.setLineWidth(0.3);
            doc.line(margin, pdfHeight - 12, pdfWidth - margin, pdfHeight - 12);
        }

        doc.save(`Proyeccion_Mensual_${filterMonthVal || new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
        console.error('Error generando PDF:', error);
        alert('Hubo un error al generar el PDF.');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}
function sortData(data) {
    const { column, direction } = sortState;
    return [...data].sort((a, b) => {
        let valA = a[column];
        let valB = b[column];

        // Manejo especial para columnas calculadas o numéricas
        if (column === 'estado') {
            valA = calculateStatus(a);
            valB = calculateStatus(b);
        } else if (column === 'proyectado') {
            valA = timeToMinutes(a.horaMin);
            valB = timeToMinutes(b.horaMin);
        } else if (column === 'real') {
            valA = timeToMinutes(a.horarioReal);
            valB = timeToMinutes(b.horarioReal);
        } else if (column === 'demora') {
            valA = timeToMinutes(a.demoras);
            valB = timeToMinutes(b.demoras);
        }

        if (valA < valB) return direction === 'asc' ? -1 : 1;
        if (valA > valB) return direction === 'asc' ? 1 : -1;
        return 0;
    });
}

function handleSort(column) {
    if (sortState.column === column) {
        sortState.direction = sortState.direction === 'asc' ? 'desc' : 'asc';
    } else {
        sortState.column = column;
        sortState.direction = 'asc';
    }
    updateDashboard();
}

function updateAIInsights(data) {
    const insightsContainer = document.getElementById('aiInsights');
    const insightsCard = document.getElementById('aiInsightsCard');
    if (!insightsContainer || !insightsCard) return;

    if (!data || data.length < 3) {
        insightsCard.style.display = 'block';
        insightsContainer.innerHTML = `
            <h3>💡 Proyección Inteligente Sugerida</h3>
            <p style="margin-top: 10px; font-size: 0.9rem; color: var(--text-secondary);">Datos insuficientes para proyección predictiva.</p>
        `;
        return;
    }

    const todayDayName = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'][new Date().getDay()];

    // Agrupar por patrones (Día + Tipo)
    const groups = {};
    data.forEach(item => {
        const key = `${item.diaSemana} - ${item.tipo}`;
        if (!groups[key]) groups[key] = { totalDev: 0, count: 0, sampleDate: item.fecha, dayName: item.diaSemana };

        const real = timeToMinutes(item.horarioReal);
        const min = timeToMinutes(item.horaMin);
        const max = timeToMinutes(item.horaMax);
        const base = Math.round((min + max) / 2);

        if (base > 0 && real > 0) {
            // Desviación real observada
            const dev = real - base;
            groups[key].totalDev += dev;
            groups[key].count++;
        }
    });

    let bestInsight = null;
    let maxAbsDevPercent = 0;

    for (const key in groups) {
        if (groups[key].count === 0) continue;

        const avgDev = groups[key].totalDev / groups[key].count;
        const groupSamples = data.filter(item => `${item.diaSemana} - ${item.tipo}` === key);
        const avgBase = groupSamples.reduce((acc, item) => {
            return acc + Math.round((timeToMinutes(item.horaMin) + timeToMinutes(item.horaMax)) / 2);
        }, 0) / groupSamples.length;

        const devPercent = (avgDev / avgBase) * 100;
        const isToday = groups[key].dayName === todayDayName;

        // Puntuación de relevancia: Magnitud del desvío + Bono si es el día actual
        const relevanceScore = Math.abs(devPercent) + (isToday ? 50 : 0);

        if (Math.abs(devPercent) > 10) {
            if (relevanceScore > maxAbsDevPercent) {
                maxAbsDevPercent = relevanceScore;
                bestInsight = {
                    key: key,
                    avgDev: avgDev,
                    percent: devPercent,
                    sampleDate: groups[key].sampleDate,
                    baseTime: avgBase,
                    isToday: isToday,
                    samples: groups[key].count
                };
            }
        }
    }

    insightsCard.style.display = 'block';

    if (bestInsight) {
        const isPositive = bestInsight.avgDev > 0;

        // LÓGICA DE ANALISTA SENIOR: 
        // 1. Recomendamos un ajuste preventivo del 70% del desvío observado para no sobre-dimensionar.
        // 2. La hora sugerida debe ser la Base + el ajuste, dándonos un margen de seguridad.
        const recommendedPercent = (bestInsight.percent * 0.7).toFixed(0);
        const adjustmentMinutes = Math.round(bestInsight.baseTime * (Math.abs(recommendedPercent) / 100));
        const suggestedMinutes = Math.round(bestInsight.baseTime + (isPositive ? adjustmentMinutes : -adjustmentMinutes));

        const suggestedTime = minutesToHHMM(suggestedMinutes);

        insightsContainer.innerHTML = `
            <h3 style="color: var(--accent-color); margin-bottom: 16px;">💡 Proyección Inteligente ${bestInsight.isToday ? 'Especial de Procesos para Hoy' : 'Sugerida'}</h3>
            <div class="insight-row">
                <div class="insight-point">
                    <strong>Observación:</strong> <br>
                    Historicamente, los [${bestInsight.key}] presentan un desvío promedio de <strong>${isPositive ? '+' : ''}${bestInsight.avgDev.toFixed(0)} min</strong> basados en ${bestInsight.samples} muestras.
                </div>
                <div class="insight-point">
                    <strong>Ajuste Recomendado:</strong> <br>
                    Sumar <strong>${isPositive ? '+' : ''}${recommendedPercent}%</strong> de tiempo al estimado base como margen de estabilidad.
                </div>
                <div class="insight-point">
                    <strong>Configuración Sugerida:</strong> <br>
                    Establecer inicio/ventana a las <strong style="color: var(--accent-color);">${suggestedTime} AM</strong> (Ajuste preventivo basado en ${bestInsight.sampleDate}).
                </div>
            </div>
        `;
    } else {
        insightsContainer.innerHTML = `
            <h3 style="margin-bottom: 16px;">💡 Proyección Inteligente Sugerida</h3>
            <p style="margin-top: 10px; font-size: 0.9rem; color: var(--text-secondary);">El motor de análisis no detecta tendencias de desvío críticas (>10%) que ameriten un ajuste estructural.</p>
        `;
    }
}

function renderStats(data) {
    const total = data.length;
    if (total === 0) return;

    const okDays      = data.filter(item => calculateStatus(item) === "OK").length;
    const failDays    = total - okDays;
    const effectiveness = (okDays / total) * 100;
    const totalDelayMin = data.reduce((acc, item) => acc + timeToMinutes(item.demoras), 0);
    const avgDelayRaw   = totalDelayMin / total;

    const DURATION = 1200;
    animateValue(document.getElementById('avgEffectiveness'), 0, effectiveness, DURATION,
        n => n.toFixed(1) + '%');
    animateValue(document.getElementById('daysOk'),  0, okDays,      DURATION, n => Math.round(n));
    animateValue(document.getElementById('daysFail'), 0, failDays,    DURATION, n => Math.round(n));
    animateValue(document.getElementById('avgDelay'), 0, avgDelayRaw, DURATION,
        n => Math.round(n) + ' min');

    // Dynamic trend subtexts
    const failPct = total > 0 ? ((failDays / total) * 100).toFixed(0) : 0;
    const totalDelayFormatted = totalDelayMin >= 60
        ? `${Math.floor(totalDelayMin / 60)}h ${totalDelayMin % 60}m acum.`
        : `${Math.round(totalDelayMin)} min acum.`;

    const elTrendEff = document.getElementById('trendEffectiveness');
    if (elTrendEff) elTrendEff.textContent = `${total} día${total !== 1 ? 's' : ''} analizados`;

    const elTrendOk = document.getElementById('trendOk');
    if (elTrendOk) elTrendOk.textContent = `${((okDays / total) * 100).toFixed(0)}% del período`;

    const elTrendFail = document.getElementById('trendFail');
    if (elTrendFail) elTrendFail.textContent = failDays > 0 ? `${failPct}% del período` : 'Sin incidentes';

    const elTrendDelay = document.getElementById('trendDelay');
    if (elTrendDelay) elTrendDelay.textContent = totalDelayMin > 0 ? totalDelayFormatted : 'Sin demoras';

    // Re-trigger fadeInUp on each stat card
    document.querySelectorAll('.stat-card').forEach((card, i) => {
        card.style.animation = 'none';
        void card.offsetWidth; // force reflow
        card.style.animation = `fadeInUp 0.4s ease ${i * 80}ms forwards`;
    });
}

function renderTable(data) {
    const tbody = document.getElementById('dataTableBody');
    tbody.innerHTML = '';

    const countEl = document.getElementById('tableRecordCount');
    if (countEl) countEl.textContent = `${data.length} registro${data.length !== 1 ? 's' : ''}`;

    // Actualizar indicadores de orden en el header
    document.querySelectorAll('th[data-sort]').forEach(th => {
        const col = th.getAttribute('data-sort');
        th.classList.remove('sort-asc', 'sort-desc');
        if (col === sortState.column) {
            th.classList.add(sortState.direction === 'asc' ? 'sort-asc' : 'sort-desc');
        }
    });

    data.forEach((item, index) => {
        const status = calculateStatus(item);
        const tr = document.createElement('tr');
        if (status === 'FUERA') tr.classList.add('row-fail');

        // Lógica de color semántico para Demora
        const delayMins = timeToMinutes(item.demoras);
        let delayClass = 'delay-none';
        if (delayMins > 30) delayClass = 'delay-critical';
        else if (delayMins > 0) delayClass = 'delay-warning';

        // Lógica de indicador relativo para Real
        const realMin = timeToMinutes(item.horarioReal);
        const minMin = timeToMinutes(item.horaMin);
        const maxMin = timeToMinutes(item.horaMax);
        let indicator = '';
        if (realMin > maxMin && maxMin > 0) indicator = '<span class="indicator-up" title="Por encima del rango">↑</span>';
        else if (realMin < minMin && minMin > 0) indicator = '<span class="indicator-down" title="Por debajo del rango">↓</span>';

        // Lógica de Motivo
        const hasMotivo = item.motivo && item.motivo !== 'Sin especificar' && item.motivo.trim() !== '';
        let motivoContent = '';
        
        if (!hasMotivo) {
            if (status === 'FUERA') {
                motivoContent = `<span class="motivo-pendiente">⚠️ Pendiente</span>`;
            } else {
                motivoContent = `<span class="motivo-empty-ok">Sin especificar</span>`;
            }
        } else {
            motivoContent = `
                <div class="motivo-text-container">
                    ${item.motivo}
                    <span class="motivo-expand-icon">↗</span>
                </div>
            `;
        }

        const motivoCellClass = `motivo-cell ${hasMotivo ? 'has-motivo' : ''}`;
        const tooltipEvents = hasMotivo ? `onmouseenter="showCustomTooltip(event, \`${item.motivo.replace(/`/g, '\\`').replace(/\${/g, '\\${')}\`)" onmouseleave="hideCustomTooltip(event)"` : '';

        tr.innerHTML = `
            <td>${item.fecha}</td>
            <td>${item.tipo}</td>
            <td>${item.horaMin} - ${item.horaMax}</td>
            <td>
                <div class="real-value">
                    ${item.horarioReal} ${indicator}
                </div>
            </td>
            <td><span class="${delayClass}">${item.demoras}</span></td>
            <td>
                <div style="display: flex; flex-direction: column; align-items: flex-start;">
                    <span class="status-badge ${status === 'OK' ? 'status-ok' : 'status-fail'}">${status}</span>
                    <span class="row-detail-trigger" onclick="event.stopPropagation(); editMotivo('${item.id}')">
                        + ver detalle
                    </span>
                </div>
            </td>
            <td class="${motivoCellClass}" ${tooltipEvents} onclick="editMotivo('${item.id}')">${motivoContent}</td>
            <td>
                <div class="action-group">
                    <button class="btn-table-action" onclick="editRecord('${item.id}')" title="Editar registro">
                        ✏️
                    </button>
                    <div class="action-sep"></div>
                    <button onclick="toggleOverride('${item.id}')" class="btn-table-action" title="${item.manualOverride ? 'Revertir validación' : 'Validar como OK'}">
                        ${item.manualOverride ? '🔄' : '✅'}
                    </button>
                    <div class="action-sep"></div>
                    <button class="btn-table-action" onclick="openDeleteModal('${item.id}', '${item.fecha}')" title="Eliminar registro">
                        🗑️
                    </button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function formatFullDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00');
    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const months = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    
    const dayName = days[date.getDay()];
    const dayNum = date.getDate().toString().padStart(2, '0');
    const monthName = months[date.getMonth()];
    
    return `${dayName} ${dayNum} de ${monthName}`;
}

function getExternalTooltip(context) {
    // Generador de Tooltip HTML Externo
    let badgeEl = document.getElementById('chart-point-badge');

    // Crear elemento si no existe
    if (!badgeEl) {
        badgeEl = document.createElement('div');
        badgeEl.id = 'chart-point-badge';
        document.body.appendChild(badgeEl);
    }

    // Ocultar si no hay tooltip
    const tooltipModel = context.tooltip;
    if (tooltipModel.opacity === 0) {
        badgeEl.classList.remove('show');
        return;
    }

    // Establecer contenido
    if (tooltipModel.body) {
        const i = tooltipModel.dataPoints[0].dataIndex;
        const item = window.currentChartData[i]; 
        const status = calculateStatus(item);
        
        const real = timeToMinutes(item.horarioReal);
        const base = Math.round((timeToMinutes(item.horaMin) + timeToMinutes(item.horaMax)) / 2);
        const diff = base > 0 ? (((real - base) / base) * 100).toFixed(1) : 0;
        
        // ---- Cartelito (Badge) ----
        const isOk = status === 'OK';
        badgeEl.className = 'chart-badge';
        badgeEl.classList.add(isOk ? 'badge-border-ok' : 'badge-border-fail');
        
        const delayMins = timeToMinutes(item.demoras);
        let delayClass = 'badge-delay-ok';
        let delayText = item.demoras;
        if (delayMins === 0) {
            delayText = 'Sin demoras';
        } else if (delayMins > 30) {
            delayClass = 'badge-delay-critical';
        }

        let badgeDevClass = parseFloat(diff) > 0 ? 'dev-positive' : (parseFloat(diff) < 0 ? 'dev-negative' : '');
        let badgeDevText = diff > 0 ? `+${diff}%` : `${diff}%`;

        badgeEl.innerHTML = `
            <div class="badge-header ${isOk ? 'badge-ok' : 'badge-fail'}">
                <div class="badge-status-row">
                    <span>${isOk ? '✅' : '❌'} <strong>${status}</strong></span>
                    <span class="badge-dev ${badgeDevClass}">${badgeDevText}</span>
                </div>
                <div style="font-size: 10.5px; color: #6B7280; font-weight: 500; margin-top: 2px;">
                    ${item.tipo}
                </div>
            </div>
            <div class="badge-divider"></div>
            <div class="badge-row">
                <span class="badge-label">Proyección</span>
                <span class="badge-val">${item.horaMin} - ${item.horaMax}</span>
            </div>
            <div class="badge-row">
                <span class="badge-label">Sin demora</span>
                <span class="badge-val">${item.horarioSindemora}</span>
            </div>
            <div class="badge-row">
                <span class="badge-label">Demoras</span>
                <span class="badge-val ${delayClass}">${delayText}</span>
            </div>
            <div class="badge-arrow"></div>
        `;
    }

    // Posicionamiento de Cartelito Hover (Badge)
    const position = context.chart.canvas.getBoundingClientRect();
    const x = tooltipModel.caretX;
    const y = tooltipModel.caretY;
    
    badgeEl.classList.add('show');
    
    // Ejecutar después de un ciclo para asegurar las dimensiones
    setTimeout(() => {
        const badgeWidth = 190;
        const badgeHeight = badgeEl.offsetHeight;
        
        // Coordenadas absolutas correctas: la posición del contenedor en la pantalla + scroll + la coordenada X/Y del chart
        let badgeLeft = position.left + window.pageXOffset + x - (badgeWidth / 2);
        
        let badgeTop = 0;
        const renderBelow = y < 80;
        
        if (renderBelow) {
            badgeTop = position.top + window.pageYOffset + y + 12; // 12px gap
            badgeEl.classList.add('badge-pos-bottom');
            badgeEl.classList.remove('badge-pos-top');
        } else {
            badgeTop = position.top + window.pageYOffset + y - badgeHeight - 12; // 12px gap
            badgeEl.classList.add('badge-pos-top');
            badgeEl.classList.remove('badge-pos-bottom');
        }
        
        badgeEl.style.left = badgeLeft + 'px';
        badgeEl.style.top = badgeTop + 'px';
    }, 0);
}

function renderChart(data) {
    const ctx = document.getElementById('trendChart').getContext('2d');

    if (chartInstance) {
        chartInstance.destroy();
    }

    if (data.length === 0) return;

    const labels = data.map(item => item.fecha.split('-')[2]); // Solo el día
    const minData = data.map(item => timeToMinutes(item.horaMin));
    const maxData = data.map(item => timeToMinutes(item.horaMax));
    const realData = data.map(item => timeToMinutes(item.horarioReal));
    const baselineData = data.map((item, i) => Math.round((minData[i] + maxData[i]) / 2));

    // Cálculos de KPIs arriba del gráfico
    let totalDev = 0;
    let anomalies = 0;
    let maxDev = 0;

    realData.forEach((real, i) => {
        const base = baselineData[i];
        const max = maxData[i];

        if (base > 0) {
            const dev = ((real - base) / base) * 100;
            totalDev += dev;
            if (dev > maxDev) maxDev = dev;
        }

        if (real > max && max > 0) {
            anomalies++;
        }
    });

    const avgDev = (totalDev / data.length).toFixed(1);

    // Actualizar indicadores en el DOM
    document.getElementById('chartAvgDev').innerText = `${avgDev > 0 ? '+' : ''}${avgDev}%`;
    document.getElementById('chartMaxDev').innerText = `${maxDev > 0 ? '+' : ''}${maxDev.toFixed(1)}%`;

    const pointColors = realData.map((val, i) => (val > maxData[i] && maxData[i] > 0) ? '#ff3b30' : '#007aff');
    const pointRadii = realData.map((val, i) => (val > maxData[i] && maxData[i] > 0) ? 7 : 5);

    // Gradientes para áreas y líneas
    const realGradient = ctx.createLinearGradient(0, 0, 0, 400);
    realGradient.addColorStop(0, 'rgba(0, 85, 255, 0.06)');
    realGradient.addColorStop(1, 'rgba(0, 85, 255, 0)');

    // Guardar datos actuales para el tooltip externo
    window.currentChartData = data;

    chartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Mínimo Histórico',
                    data: minData,
                    borderColor: 'transparent',
                    pointRadius: 0,
                    fill: false,
                    tension: 0.4
                },
                {
                    label: 'Rango Histórico',
                    data: maxData,
                    borderColor: 'rgba(52, 199, 89, 0.2)',
                    borderWidth: 1,
                    pointRadius: 0,
                    fill: 0,
                    backgroundColor: 'rgba(52, 199, 89, 0.05)',
                    tension: 0.4
                },
                {
                    label: 'Proyección (Base)',
                    data: baselineData,
                    borderColor: 'rgba(99, 102, 241, 0.7)',
                    borderWidth: 1.5,
                    pointRadius: 0,
                    fill: false,
                    tension: 0.4
                },
                {
                    label: 'Ejecución Real',
                    data: realData,
                    borderColor: '#0055ff',
                    borderWidth: 3,
                    tension: 0.4,
                    fill: false,
                    pointRadius: pointRadii,
                    pointBackgroundColor: pointColors,
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointHoverRadius: 10,
                    pointHoverBorderWidth: 0,
                    pointHoverBackgroundColor: 'rgba(239, 68, 68, 1)',
                    order: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    top: 10,
                    bottom: 10,
                    left: 20,
                    right: 30
                }
            },
            interaction: {
                mode: 'index',
                intersect: false,
            },
            onHover: (event, chartElement) => {
                const canvas = event.chart.canvas;
                canvas.style.cursor = chartElement.length > 0 ? 'pointer' : 'default';
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    enabled: false,
                    external: getExternalTooltip
                }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    grid: { color: 'rgba(0,0,0,0.02)', drawBorder: false },
                    ticks: {
                        font: { size: 10 },
                        padding: 4,
                        callback: function (value) {
                            return minutesToHHMM(value);
                        }
                    }
                },
                x: {
                    grid: { display: false, drawBorder: false },
                    ticks: {
                        font: { size: 10 },
                        padding: 4
                    }
                }
            }
        }
    });
}

function editMotivo(id) {
    const index = window.projectionData.findIndex(item => item.id == id);
    if (index === -1) return;
    currentEditIndex = index;
    const currentMotivo = window.projectionData[index].motivo || '';
    document.getElementById('motivoInput').value = currentMotivo;
    document.getElementById('motivoModal').style.display = 'flex';
}

async function saveMotivo() {
    const newMotivo = document.getElementById('motivoInput').value;
    const item = window.projectionData[currentEditIndex];

    try {
        const { error } = await supabaseClient
            .from('Estimacion')
            .update({ MotivoDemora: newMotivo })
            .eq('id', item.id);

        if (error) throw error;

        item.motivo = newMotivo;
        closeModal('motivoModal');
        updateDashboard();
    } catch (err) {
        console.error('Error actualizando motivo:', err);
        showToast('Error al actualizar el comentario.', 'error');
    }
}

function openAddModal() {
    currentEditIndex = null;
    document.getElementById('modalTitle').innerText = 'Añadir Nuevo Registro';
    document.getElementById('btnSaveRecord').innerText = 'Añadir';

    _initModalDatePicker();
    _modalDatePicker.setValue(_cdpToYMD(new Date()));
    document.getElementById('addTipo').value = 'Normal';
    document.getElementById('addHoraMin').value = '';
    document.getElementById('addHoraMax').value = '';
    document.getElementById('addHorarioReal').value = '';
    document.getElementById('addDemoras').value = '';

    document.getElementById('addRecordModal').style.display = 'flex';
}

function editRecord(id) {
    const index = window.projectionData.findIndex(item => item.id == id);
    if (index === -1) return;
    
    currentEditIndex = index;
    const item = window.projectionData[index];

    document.getElementById('modalTitle').innerText = 'Editar Registro';
    document.getElementById('btnSaveRecord').innerText = 'Actualizar';

    _initModalDatePicker();
    _modalDatePicker.setValue(item.fecha);
    document.getElementById('addTipo').value = item.tipo;
    document.getElementById('addHoraMin').value = item.horaMin.substring(0, 5);
    document.getElementById('addHoraMax').value = item.horaMax.substring(0, 5);
    document.getElementById('addHorarioReal').value = item.horarioReal;
    document.getElementById('addDemoras').value = item.demoras;

    document.getElementById('addRecordModal').style.display = 'flex';
}

function saveRecordAction() {
    if (currentEditIndex !== null && currentEditIndex !== undefined && window.projectionData[currentEditIndex].id) {
        updateExistingRecord();
    } else {
        addNewRecord();
    }
}

function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

async function updateExistingRecord() {
    const item = window.projectionData[currentEditIndex];
    const dateVal = document.getElementById('addFecha').value;

    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const diaSemana = days[new Date(dateVal + 'T00:00:00').getDay()];

    const formatTimeForDB = (val) => {
        if (!val) return "00:00:00";
        const parts = val.split(':');
        if (parts.length === 2) return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}:00`;
        if (parts.length === 3) return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}:${parts[2].padStart(2, '0')}`;
        return val;
    };

    const hReal = formatTimeForDB(document.getElementById('addHorarioReal').value);
    const hDemoras = formatTimeForDB(document.getElementById('addDemoras').value);
    const realMin = timeToMinutes(hReal);
    const demoraMin = timeToMinutes(hDemoras);
    const sinDemoraMin = Math.max(0, realMin - demoraMin);

    const minToHHMMSS = (m) => {
        const h = Math.floor(m / 60).toString().padStart(2, '0');
        const min = (m % 60).toString().padStart(2, '0');
        return `${h}:${min}:00`;
    };

    const updateData = {
        Fecha: dateVal.split('-').reverse().join('/'),
        Tipo: document.getElementById('addTipo').value,
        DiaSemana: diaSemana,
        HoraMin: formatTimeForDB(document.getElementById('addHoraMin').value),
        HoraMax: formatTimeForDB(document.getElementById('addHoraMax').value),
        HorarioReal: hReal,
        Demoras: hDemoras,
        HorarioSinDemora: minToHHMMSS(sinDemoraMin) // Reverted to singular
    };

    console.log(`🚀 Iniciando actualización en Supabase para ID: ${item.id}`, updateData);

    try {
        console.log(`🚀 Payload de actualización (ID ${item.id}):`, updateData);
        // Asegurarnos que el ID sea numérico si la DB lo requiere
        const targetId = Number(item.id);
        
        const { error, data } = await supabaseClient
            .from('Estimacion')
            .update(updateData)
            .eq('id', targetId)
            .select();

        if (error) {
            console.error('❌ Error de Supabase al actualizar:', error);
            throw error;
        }

        if (!data || data.length === 0) {
            console.warn(`⚠️ No se encontró el registro con ID ${targetId} para actualizar.`);
            // Diagnostic: Verificamos si existe con otro casing o tipo
            const { data: check } = await supabaseClient.from('Estimacion').select('id').eq('id', targetId).limit(1);
            if (!check || check.length === 0) {
                console.error(`🛑 El ID ${targetId} REALMENTE no existe en la tabla.`);
            }
            throw new Error(`Registro con ID ${targetId} no localizado en la base de datos.`);
        }

        addLog(`Registro ${item.fecha} actualizado exitosamente.`, "info");
        showToast("Registro actualizado correctamente");
        await fetchProjections();
        closeModal('addRecordModal');
    } catch (err) {
        console.error('Error actualizando registro:', err);
        addLog(`Error al actualizar: ${err.message}`, "error");
        showToast(`Error: ${err.message}`, 'error');
    }
}

async function addNewRecord() {
    const dateVal = document.getElementById('addFecha').value;
    if (!dateVal) {
        alert("Por favor seleccione una fecha.");
        return;
    }

    // Prevenir fecha duplicada
    const alreadyExists = window.projectionData?.some(r => r.fecha === dateVal);
    if (alreadyExists) {
        showToast(`Ya existe un registro para el ${dateVal.split('-').reverse().join('/')}. Editá el existente.`, 'error');
        return;
    }

    const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const diaSemana = days[new Date(dateVal + 'T00:00:00').getDay()];

    // Función interna para asegurar formato HH:MM
    const formatTimeForDB = (val) => {
        if (!val) return "00:00:00";
        const parts = val.split(':');
        if (parts.length === 2) return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}:00`;
        return val;
    };

    const hReal = formatTimeForDB(document.getElementById('addHorarioReal').value);
    const hDemoras = formatTimeForDB(document.getElementById('addDemoras').value);

    const realMin = timeToMinutes(hReal);
    const demoraMin = timeToMinutes(hDemoras);
    const sinDemoraMin = Math.max(0, realMin - demoraMin);

    const minToHHMMSS = (m) => {
        const h = Math.floor(m / 60).toString().padStart(2, '0');
        const min = (m % 60).toString().padStart(2, '0');
        return `${h}:${min}:00`;
    };

    const newRecordSupabase = {
        Fecha: dateVal.split('-').reverse().join('/'),
        Tipo: document.getElementById('addTipo').value,
        DiaSemana: diaSemana,
        HoraMin: formatTimeForDB(document.getElementById('addHoraMin').value),
        HoraMax: formatTimeForDB(document.getElementById('addHoraMax').value),
        HorarioReal: hReal,
        Demoras: hDemoras,
        HorarioSinDemora: minToHHMMSS(sinDemoraMin),
        FranjaSLO: "06:15:00",
        MotivoDemora: ""
    };

    addLog(`Insertando nuevo registro: Fecha=${newRecordSupabase.Fecha}, Demoras=${hDemoras}`, "info");

    try {
        const { data, error } = await supabaseClient
            .from('Estimacion')
            .insert([newRecordSupabase])
            .select();

        if (error) {
            console.error('Error detallado de Supabase:', error);
            throw error;
        }

        addLog(`Inserción exitosa. ID generado: ${data && data[0] ? data[0].id : '?' }`, "info");
        showToast("Registro guardado exitosamente");
        await fetchProjections();
        closeModal('addRecordModal');
    } catch (err) {
        console.error('Error añadiendo registro:', err);
        addLog(`Error al insertar: ${err.message}`, "error");
        showToast(`Error: ${err.message || 'Error de base de datos'}`, 'error');
    }
}

function importData(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet);

            if (jsonData.length === 0) {
                alert("El archivo parece estar vacío o no tiene el formato correcto.");
                return;
            }

            // Mapeo robusto: intenta encontrar la columna aunque tenga espacios o mayúsculas distintas
            const importedRecords = jsonData.map((row, index) => {
                const getVal = (name) => {
                    const key = Object.keys(row).find(k => k.toLowerCase().trim() === name.toLowerCase());
                    return key ? row[key] : null;
                };

                const fechaRaw = getVal('Fecha');
                let fechaFormateada = fechaRaw || '';

                if (fechaRaw instanceof Date) {
                    fechaFormateada = fechaRaw.toISOString().split('T')[0];
                } else if (typeof fechaRaw === 'number' && fechaRaw > 40000) {
                    const date = new Date((fechaRaw - 25569) * 86400 * 1000);
                    fechaFormateada = date.toISOString().split('T')[0];
                } else if (typeof fechaRaw === 'string' && fechaRaw.includes('/')) {
                    const parts = fechaRaw.split('/');
                    if (parts.length === 3) {
                        const d = parts[0].padStart(2, '0');
                        const m = parts[1].padStart(2, '0');
                        const y = parts[2].length === 2 ? '20' + parts[2] : parts[2];
                        fechaFormateada = `${y}-${m}-${d}`;
                    }
                }

                return {
                    fecha: fechaFormateada,
                    tipo: getVal('Tipo') || 'Normal',
                    diaSemana: getVal('Día Semana') || 'N/A',
                    horaMin: getVal('Hora Mín') || '0:00',
                    horaMax: getVal('Hora Máx') || '0:00',
                    horarioReal: getVal('Horario Real') || '0:00:00',
                    demoras: getVal('Demoras') || '0:00:00',
                    horarioSindemora: getVal('Horario Sin Demora') || getVal('Horario Real') || '0:00:00',
                    franjaSLO: getVal('Franja SLO') || "06:15",
                    motivo: getVal('Motivo') || '',
                    manualOverride: false
                };
            }).filter(item => item.fecha !== ''); // Ignorar filas sin fecha

            if (importedRecords.length === 0) {
                showToast("No se encontraron registros válidos. Verifica la columna 'Fecha'.", "error");
                return;
            }

            if (confirm(`Se han detectado ${importedRecords.length} registros válidos. ¿Deseas importarlos a la base de datos de Supabase? (Se sumarán a los actuales)`)) {

                const supabaseRecords = importedRecords.map(item => ({
                    Fecha: item.fecha.split('-').reverse().join('/'),
                    Tipo: item.tipo,
                    DiaSemana: item.diaSemana,
                    HoraMin: item.horaMin,
                    HoraMax: item.horaMax,
                    HorarioReal: item.horarioReal,
                    Demoras: item.demoras,
                    HorarioSinDemora: item.horarioSindemora,
                    FranjaSLO: item.franjaSLO,
                    MotivoDemora: item.motivo
                    // manualOverride: false // Columna no existente en DB por ahora
                }));

                (async () => {
                    try {
                        const { error } = await supabaseClient
                            .from('Estimacion')
                            .insert(supabaseRecords);

                        if (error) throw error;

                        showToast("¡Importación exitosa!");
                        await fetchProjections();
                    } catch (err) {
                        console.error("Error al persistir importación:", err);
                        showToast("Error al guardar los datos importados.", "error");
                    }
                })();
            }
        } catch (err) {
            console.error("Error al importar:", err);
            showToast("Error crítico al leer el archivo Excel.", "error");
        } finally {
            event.target.value = '';
        }
    };
    reader.readAsArrayBuffer(file);
}

function exportData() {
    const dataToExport = window.projectionData.map(item => ({
        'Fecha': item.fecha,
        'Tipo': item.tipo,
        'Día Semana': item.diaSemana,
        'Hora Mín': item.horaMin,
        'Hora Máx': item.horaMax,
        'Horario Real': item.horarioReal,
        'Demoras': item.demoras,
        'Horario Sin Demora': item.horarioSindemora,
        'Estado': calculateStatus(item),
        'Motivo': item.motivo || ''
    }));

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Proyecciones");
    XLSX.writeFile(wb, "proyeccion_export.xlsx");
}

async function toggleOverride(id) {
    const item = window.projectionData.find(p => p.id == id);
    if (!item) return;
    const newState = !item.manualOverride;

    try {
        const columnsToTry = [item._idSource, 'id', 'ID', 'Id'].filter(c => c && c !== '');
        const uniqueColumns = [...new Set(columnsToTry)];
        
        let success = false;
        let lastError = null;

        for (const col of uniqueColumns) {
            const { error, data } = await supabaseClient
                .from('Estimacion')
                .update({ manualOverride: newState })
                .eq(col, item.id)
                .select();

            if (!error && data && data.length > 0) {
                success = true;
                break;
            }
            if (error) lastError = error;
        }

        if (!success) throw (lastError || new Error("Registro no encontrado"));

        item.manualOverride = newState;
        updateDashboard();
        showToast(`Estado ${newState ? 'Validado' : 'Revertido'} exitosamente`);
    } catch (err) {
        console.error('Error actualizando manualOverride:', err);
        showToast('No se pudo guardar el cambio manual en la base de datos.', 'error');

        item.manualOverride = newState;
        updateDashboard();
    }
}

function openDeleteModal(id, date) {
    console.log(`Abriendo modal de eliminación para ID: ${id}, Fecha: ${date}`);
    addLog(`Confirmando eliminación para el día ${date}...`, "info");

    document.getElementById('deleteRecordDate').innerText = date;
    document.getElementById('deleteConfirmModal').style.display = 'flex';

    // Configurar el botón de confirmar con el ID actual
    const btn = document.getElementById('btnConfirmDelete');
    btn.onclick = () => confirmDeleteRecord(id);
}

async function confirmDeleteRecord(id) {
    closeModal('deleteConfirmModal');
    addLog(`Iniciando eliminación del registro ID: ${id}...`, "info");

    try {
        const { error, count } = await supabaseClient
            .from('Estimacion')
            .delete({ count: 'exact' })
            .eq('id', Number(id));

        if (error) throw error;
        if (count === 0) throw new Error('No se encontró el registro para eliminar.');

        addLog(`Registro ID: ${id} eliminado con éxito.`, "info");
        showToast("Registro eliminado con éxito");
        await fetchProjections();
    } catch (err) {
        console.error('Error eliminando registro:', err);
        addLog(`Fallo al eliminar: ${err.message}`, "error");
        showToast(`Error: ${err.message}`, 'error');
    }
}


// --- Funciones para Monitoreo Técnico ---

function updateHeatmap(data) {
    const container = document.getElementById('riskHeatmap');
    if (!container) return;

    const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
    const results = days.map(day => {
        const historical = data.filter(item => item.diaSemana === day);
        if (historical.length === 0) return { day, risk: 'low', height: 20 };

        const fails = historical.filter(item => calculateStatus(item) === "FUERA").length;
        const prob = (fails / historical.length) * 100;

        let riskClass = 'risk-low';
        if (prob > 60) riskClass = 'risk-high';
        else if (prob > 20) riskClass = 'risk-medium';

        return {
            day,
            riskClass,
            height: Math.max(20, prob || 30),
            prob: prob.toFixed(0),
            count: historical.length
        };
    });

    container.innerHTML = results.map(res => `
        <div class="heatmap-cell ${res.riskClass}" 
             style="height:${res.height}%;" 
             title="${res.day}: ${res.prob}% de riesgo (${res.count} muestras)">
        </div>
    `).join('');
}

function renderMonitoringTrend(data) {
    const canvas = document.getElementById('monitoringTrendChart');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const labels = data.map(item => item.fecha.split('-')[2]); // Días
    const deviationData = data.map(item => {
        const effective = timeToMinutes(item.horarioSindemora);
        const max = timeToMinutes(item.horaMax);
        return effective > 0 && max > 0 ? (effective - max) : 0;
    });

    // Destruir instancia previa si existe (usando una variable global específica o chequeando)
    if (window.monitoringChartInstance) window.monitoringChartInstance.destroy();

    window.monitoringChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Desviación (min)',
                data: deviationData,
                backgroundColor: deviationData.map(v => v > 0 ? 'rgba(255, 59, 48, 0.5)' : 'rgba(52, 199, 89, 0.3)'),
                borderColor: deviationData.map(v => v > 0 ? '#ff3b30' : '#34c759'),
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.03)' } },
                x: { grid: { display: false } }
            }
        }
    });

    // Actualizar resumen de tendencia
    const avgDev = deviationData.reduce((a, b) => a + b, 0) / deviationData.length;
    document.getElementById('trendSummary').innerHTML = `
        <strong>Tendencia Global:</strong> La desviación promedio en el periodo seleccionado es de <strong>${avgDev.toFixed(1)} min</strong>.
        ${avgDev > 10 ? '⚠️ Se recomienda revisar la capacidad de procesamiento.' : '✅ Estabilidad dentro de parámetros normales.'}
    `;
}

// --- Persistencia de Filtros ---
function saveFilters(month, type) {
    localStorage.setItem('filterMonth', month);
    localStorage.setItem('filterType', type);
}

function loadFilters() {
    const savedMonth = localStorage.getItem('filterMonth');
    const savedType = localStorage.getItem('filterType');

    const monthInput = document.getElementById('filterMonth');
    const typeInput = document.getElementById('filterType');

    if (monthInput) {
        if (savedMonth) {
            monthInput.value = savedMonth;
        } else {
            // Valor por defecto: Mes Actual (YYYY-MM)
            const now = new Date();
            const year = now.getFullYear();
            const month = (now.getMonth() + 1).toString().padStart(2, '0');
            monthInput.value = `${year}-${month}`;
        }
    }

    if (typeInput && savedType) {
        typeInput.value = savedType;
    }
}

// Listeners para filtros
if (document.getElementById('filterType')) {
    document.getElementById('filterType').addEventListener('change', updateDashboard);
}
if (document.getElementById('filterMonth')) {
    document.getElementById('filterMonth').addEventListener('change', updateDashboard);
}

// Inicialización
window.onload = async () => {
    loadFilters();
    initMonthPicker();
    await fetchProjections();
};

// --- Componente Custom Month Picker ---
function initMonthPicker() {
    const trigger = document.getElementById('customMonthTrigger');
    const dropdown = document.getElementById('customMonthDropdown');
    const display = document.getElementById('customMonthDisplay');
    const hiddenInput = document.getElementById('filterMonth');
    const grid = document.getElementById('cmdMonthGrid');
    const yearDisplay = document.getElementById('cmdCurrentYear');
    
    if (!trigger || !dropdown) return;

    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const fullMonths = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    
    let currentDate = hiddenInput.value ? new Date(hiddenInput.value + '-01T00:00:00') : new Date();
    let currentYearView = currentDate.getFullYear();
    
    function updateDisplay(val) {
        if (!val) {
            display.textContent = 'Seleccionar mes';
            hiddenInput.value = '';
            hiddenInput.dispatchEvent(new Event('change'));
            return;
        }
        const [y, m] = val.split('-');
        display.textContent = `${fullMonths[parseInt(m)-1]} de ${y}`;
    }

    // Initialize display from input value (which is set by loadFilters)
    if (hiddenInput.value) updateDisplay(hiddenInput.value);

    function renderGrid() {
        grid.innerHTML = '';
        yearDisplay.textContent = currentYearView;
        
        const today = new Date();
        const selectedVal = hiddenInput.value;
        const [selY, selM] = selectedVal ? selectedVal.split('-') : [null, null];

        months.forEach((mName, index) => {
            const cell = document.createElement('div');
            cell.className = 'cmd-month-cell';
            cell.textContent = mName;
            
            const monthNumStr = (index + 1).toString().padStart(2, '0');
            const cellVal = `${currentYearView}-${monthNumStr}`;
            
            if (selY == currentYearView && selM == monthNumStr) {
                cell.classList.add('active-month');
            } else if (today.getFullYear() == currentYearView && today.getMonth() == index) {
                cell.classList.add('current-month');
            }
            
            cell.onclick = (e) => {
                e.stopPropagation();
                hiddenInput.value = cellVal;
                updateDisplay(cellVal);
                closeDropdown();
                hiddenInput.dispatchEvent(new Event('change')); // triggers updateDashboard
            };
            grid.appendChild(cell);
        });
    }

    function toggleDropdown(e) {
        e.stopPropagation();
        const isOpen = dropdown.classList.contains('show');
        if (isOpen) {
            closeDropdown();
        } else {
            // Recalculate view year based on current selection
            currentDate = hiddenInput.value ? new Date(hiddenInput.value + '-01T00:00:00') : new Date();
            currentYearView = currentDate.getFullYear();
            renderGrid();
            
            trigger.classList.add('active');
            dropdown.classList.add('show');
            
            // Positioning logic
            const triggerRect = trigger.getBoundingClientRect();
            const spaceBelow = window.innerHeight - triggerRect.bottom;
            const dropdownHeight = 240; // aprox height
            
            if (spaceBelow < dropdownHeight && triggerRect.top > dropdownHeight) {
                dropdown.classList.add('pos-top');
                dropdown.classList.remove('pos-bottom');
            } else {
                dropdown.classList.add('pos-bottom');
                dropdown.classList.remove('pos-top');
            }
        }
    }

    function closeDropdown() {
        dropdown.classList.remove('show');
        trigger.classList.remove('active');
    }

    trigger.onclick = toggleDropdown;
    
    document.getElementById('cmdPrevYear').onclick = (e) => {
        e.stopPropagation();
        currentYearView--;
        renderGrid();
    };

    document.getElementById('cmdNextYear').onclick = (e) => {
        e.stopPropagation();
        currentYearView++;
        renderGrid();
    };

    document.getElementById('cmdClearBtn').onclick = (e) => {
        e.stopPropagation();
        updateDisplay('');
        closeDropdown();
    };

    document.getElementById('cmdTodayBtn').onclick = (e) => {
        e.stopPropagation();
        const today = new Date();
        const val = `${today.getFullYear()}-${(today.getMonth() + 1).toString().padStart(2, '0')}`;
        hiddenInput.value = val;
        updateDisplay(val);
        closeDropdown();
        hiddenInput.dispatchEvent(new Event('change'));
    };

    // Close when clicking outside
    document.addEventListener('click', (e) => {
        if (!trigger.contains(e.target) && !dropdown.contains(e.target)) {
            closeDropdown();
        }
    });

    // Make sure interaction inside dropdown doesn't close it
    dropdown.onclick = (e) => e.stopPropagation();
}

// --- Lógica de Tooltip Personalizado para Motivos ---
function showCustomTooltip(event, text) {
    let tooltip = document.getElementById('custom-tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'custom-tooltip';
        tooltip.className = 'custom-tooltip';
        document.body.appendChild(tooltip);
    }
    tooltip.innerText = text;
    tooltip.classList.add('show');
    
    const updatePosition = (e) => {
        const x = e.clientX + 10;
        const y = e.clientY + 10;
        
        const width = tooltip.offsetWidth;
        const height = tooltip.offsetHeight;
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;
        
        let left = x;
        let top = y;
        
        if (x + width > windowWidth) left = x - width - 20;
        if (y + height > windowHeight) top = y - height - 20;
        
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
    };
    
    updatePosition(event);
    event.target.addEventListener('mousemove', updatePosition);
    event.target._tooltipUpdatePos = updatePosition;
}

function hideCustomTooltip(event) {
    const tooltip = document.getElementById('custom-tooltip');
    if (tooltip) {
        tooltip.classList.remove('show');
    }
    if (event.target._tooltipUpdatePos) {
        event.target.removeEventListener('mousemove', event.target._tooltipUpdatePos);
        delete event.target._tooltipUpdatePos;
    }
}
// --- Monitoreo de Horarios (Rework Page) ---
function getPreviousMonth(monthStr) {
    if (!monthStr || !monthStr.includes('-')) return '';
    const [year, month] = monthStr.split('-').map(Number);
    let prevMonth = month - 1;
    let prevYear = year;
    if (prevMonth === 0) {
        prevMonth = 12;
        prevYear -= 1;
    }
    return `${prevYear}-${prevMonth.toString().padStart(2, '0')}`;
}

async function renderMonitoringPage(currentMonth, previousMonth) {
    const container = document.getElementById('monitoringGroups');
    const kpiContainer = document.getElementById('globalMonitoringKPIs');
    if (!container || !kpiContainer) return;

    const groupDefinitions = [
        { 
            id: 'lunes-normal', 
            title: 'Lunes Normal', 
            filter: (item) => item.diaSemana === 'Lunes' && item.tipo === 'Normal' 
        },
        { 
            id: 'martes-jueves-normal', 
            title: 'Martes a Jueves Normal', 
            filter: (item) => ['Martes', 'Miércoles', 'Jueves'].includes(item.diaSemana) && item.tipo === 'Normal' 
        },
        { 
            id: 'viernes-todos', 
            title: 'Viernes (Todos)', 
            filter: (item) => item.diaSemana === 'Viernes' 
        },
        { 
            id: 'dias-especiales', 
            title: 'Días Especiales', 
            filter: (item) => item.tipo !== 'Normal' 
        }
    ];

    let groupResults = [];
    let totalRecords = 0;

    // Primer pase: Calcular promedios y recolectar resultados para KPIs globales
    groupDefinitions.forEach(group => {
        const currentData = window.projectionData.filter(item => 
            item.fecha.startsWith(currentMonth) && group.filter(item)
        ).sort((a,b) => a.fecha.localeCompare(b.fecha));

        const previousData = window.projectionData.filter(item => 
            item.fecha.startsWith(previousMonth) && group.filter(item)
        );

        const currentAvg = calculateAverage(currentData);
        const previousAvg = calculateAverage(previousData);
        
        groupResults.push({
            ...group,
            currentData,
            previousData,
            currentAvg,
            previousAvg
        });

        totalRecords += currentData.length;
    });

    // Renderizar KPIs Globales
    if (groupResults.length > 0) {
        const activeGroups = groupResults.filter(g => g.currentAvg > 0);
        const bestGroup = activeGroups.length > 0 ? activeGroups.reduce((prev, curr) => prev.currentAvg < curr.currentAvg ? prev : curr) : { title: 'N/A', currentAvg: 0 };
        const worstGroup = activeGroups.length > 0 ? activeGroups.reduce((prev, curr) => prev.currentAvg > curr.currentAvg ? prev : curr) : { title: 'N/A', currentAvg: 0 };
        const globalAvg = activeGroups.length > 0 ? Math.round(activeGroups.reduce((acc, g) => acc + g.currentAvg, 0) / activeGroups.length) : 0;

        kpiContainer.innerHTML = `
            <div class="global-kpi-container">
                <div class="monitoring-kpi-card best">
                    <div class="mkpi-icon mkpi-green">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg>
                    </div>
                    <div class="mkpi-body">
                        <span class="mkpi-label">Mejor Grupo · Más Temprano</span>
                        <span class="mkpi-name best">${bestGroup.title}</span>
                        <span class="mkpi-time best">${minutesToHHMM(bestGroup.currentAvg)}</span>
                    </div>
                </div>
                <div class="monitoring-kpi-card worst">
                    <div class="mkpi-icon mkpi-red">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    </div>
                    <div class="mkpi-body">
                        <span class="mkpi-label">Peor Grupo · Más Tardío</span>
                        <span class="mkpi-name worst">${worstGroup.title}</span>
                        <span class="mkpi-time worst">${minutesToHHMM(worstGroup.currentAvg)}</span>
                    </div>
                </div>
                <div class="monitoring-kpi-card standard">
                    <div class="mkpi-icon mkpi-blue">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    </div>
                    <div class="mkpi-body">
                        <span class="mkpi-label">Promedio Global</span>
                        <span class="mkpi-big standard" id="monGlobalAvg">${minutesToHHMM(globalAvg)}</span>
                    </div>
                </div>
                <div class="monitoring-kpi-card standard">
                    <div class="mkpi-icon mkpi-indigo">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                    </div>
                    <div class="mkpi-body">
                        <span class="mkpi-label">Total Registros</span>
                        <span class="mkpi-big standard" id="monTotalRecords">${totalRecords}</span>
                    </div>
                </div>
            </div>
        `;

        // Animate numeric values and trigger fadeInUp on monitoring KPI cards
        const avgEl   = document.getElementById('monGlobalAvg');
        const totalEl = document.getElementById('monTotalRecords');
        if (avgEl)   animateValue(avgEl,   0, globalAvg,    1200, n => minutesToHHMM(Math.round(n)));
        if (totalEl) animateValue(totalEl, 0, totalRecords, 1200, n => Math.round(n));

        kpiContainer.querySelectorAll('.monitoring-kpi-card').forEach((card, i) => {
            card.style.animation = 'none';
            void card.offsetWidth;
            card.style.animation = `fadeInUp 0.4s ease ${i * 80}ms forwards`;
        });
    }

    // Segundo pase: Renderizar tarjetas de grupo
    let html = '';
    groupResults.forEach(res => {
        const diff = res.currentAvg - res.previousAvg;
        const diffPercent = res.previousAvg > 0 ? ((diff / res.previousAvg) * 100).toFixed(1) : 0;
        
        let semClass = 'neutral';
        let trendClass = 'neutral';
        if (res.previousAvg > 0) {
            semClass = diff > 0 ? 'bad' : 'good';
            trendClass = diff > 0 ? 'bad' : 'good';
        }
        
        const diffIcon = diff > 0 ? '↑' : '↓';

        // Determinar si ocultar columna Tipo
        const allSameType = res.currentData.every(item => item.tipo === res.currentData[0].tipo);
        const hideType = allSameType && res.id !== 'dias-especiales';

        // Identificar mejor/peor valor de la tabla para resaltado semántico
        let minTime = null;
        let maxTime = null;
        if (res.currentData.length > 1) {
            const times = res.currentData.map(d => timeToMinutes(d.horarioSindemora)).filter(t => t > 0);
            if (times.length > 0) {
                minTime = Math.min(...times);
                maxTime = Math.max(...times);
            }
        }

        html += `
            <div class="monitoring-group-card">
                <div class="group-header">
                    ${res.title}
                    ${res.previousAvg > 0 ? `<span class="group-trend-badge ${trendClass}">${diffIcon} ${Math.abs(diffPercent)}%</span>` : ''}
                </div>
                <table class="group-table">
                    <thead>
                        <tr>
                            <th>Fecha</th>
                            ${!hideType ? '<th>Tipo</th>' : ''}
                            <th>Día</th>
                            <th>Sin Demora</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${res.currentData.map(item => {
                            const itemMinutes = timeToMinutes(item.horarioSindemora);
                            let rowClass = '';
                            if (minTime !== null && maxTime !== null && minTime !== maxTime) {
                                if (itemMinutes === minTime) rowClass = 'row-val-best';
                                else if (itemMinutes === maxTime) rowClass = 'row-val-worst';
                            }
                            return `
                                <tr>
                                    <td>${item.fecha.split('-').slice(1).reverse().join('/')}</td>
                                    ${!hideType ? `<td>${item.tipo}</td>` : ''}
                                    <td>${item.diaSemana.substring(0, 3)}</td>
                                    <td class="${rowClass}">${item.horarioSindemora}</td>
                                </tr>
                            `;
                        }).join('')}
                        ${res.currentData.length === 0 ? `<tr><td colspan="${hideType ? 3 : 4}" style="color:#9CA3AF; padding: 20px; text-align: center;">Sin registros para el mes actual</td></tr>` : ''}
                    </tbody>
                </table>
                <div class="group-summary-footer">
                    <div class="avg-box">
                        <div class="avg-label">Hora Promedio</div>
                        <div class="avg-value ${semClass}">${minutesToHHMM(res.currentAvg)}</div>
                    </div>
                </div>
                <div class="comparison-box">
                    <div class="comp-pill-mini ant" title="Promedio mes anterior">
                        Ant ${minutesToHHMM(res.previousAvg)}
                    </div>
                    <div class="comp-pill-mini act ${semClass}" title="Promedio mes actual">
                        Act ${minutesToHHMM(res.currentAvg)}
                    </div>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

function calculateAverage(data) {
    if (!data || data.length === 0) return 0;
    const totalMinutes = data.reduce((acc, item) => acc + timeToMinutes(item.horarioSindemora), 0);
    return Math.round(totalMinutes / data.length);
}

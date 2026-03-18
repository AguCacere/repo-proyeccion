// Configuración Global
const TOLERANCIA_MINUTOS = 3;
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
            // Si el texto es literal "Da" o "Da"
            if (cleanTipo === "Da" || cleanTipo === "Da") cleanTipo = "Día";
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

async function generatePDFReport() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const dashboard = document.querySelector('.main-content');

    // Mostrar feedback visual
    const btn = document.querySelector('.btn-pdf');
    const originalText = btn.innerHTML;
    btn.innerHTML = '⏳ Generando...';
    btn.disabled = true;

    try {
        // Capturar el grid de stacks y el gráfico (excluyendo tabla para el reporte ejecutivo)
        const canvas = await html2canvas(dashboard, {
            scale: 2,
            useCORS: true,
            logging: false,
            ignoreElements: (el) => el.tagName === 'TABLE' || el.classList.contains('actions-header') || el.classList.contains('sidebar') || el.classList.contains('filters-bar')
        });

        const imgData = canvas.toDataURL('image/png');
        const imgProps = doc.getImageProperties(imgData);
        const pdfWidth = doc.internal.pageSize.getWidth();
        const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;

        // Título del Reporte
        doc.setFontSize(22);
        doc.setTextColor(29, 29, 31);
        doc.text('Reporte Ejecutivo de Proyección', 20, 25);

        doc.setFontSize(10);
        doc.setTextColor(100, 100, 100);
        doc.text(`Fecha de generación: ${new Date().toLocaleString()}`, 20, 32);

        doc.addImage(imgData, 'PNG', 10, 45, pdfWidth - 20, pdfHeight);

        // Footer
        doc.setFontSize(9);
        doc.text('Generado automáticamente por SQR Tracker - Operaciones Bancarias', 105, 285, { align: 'center' });

        doc.save(`Reporte_SQR_${new Date().toISOString().split('T')[0]}.pdf`);
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

    const okDays = data.filter(item => calculateStatus(item) === "OK").length;
    const failDays = total - okDays;
    const effectiveness = ((okDays / total) * 100).toFixed(1);

    document.getElementById('avgEffectiveness').innerText = `${effectiveness}%`;
    document.getElementById('daysOk').innerText = okDays;
    document.getElementById('daysFail').innerText = failDays;

    // Calcular demora promedio (en minutos)
    const totalDelayMin = data.reduce((acc, item) => acc + timeToMinutes(item.demoras), 0);
    const avgDelay = (totalDelayMin / total).toFixed(0);
    document.getElementById('avgDelay').innerText = `${avgDelay} min`;
}

function renderTable(data) {
    const tbody = document.getElementById('dataTableBody');
    tbody.innerHTML = '';

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
    document.getElementById('chartAnomalies').innerText = anomalies;
    document.getElementById('chartMaxDev').innerText = `${maxDev > 0 ? '+' : ''}${maxDev.toFixed(1)}%`;

    const pointColors = realData.map((val, i) => (val > maxData[i] && maxData[i] > 0) ? '#ff3b30' : '#007aff');
    const pointRadii = realData.map((val, i) => (val > maxData[i] && maxData[i] > 0) ? 7 : 5);

    // Gradientes para áreas y líneas
    const realGradient = ctx.createLinearGradient(0, 0, 0, 400);
    realGradient.addColorStop(0, 'rgba(0, 85, 255, 0.2)');
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
                    borderColor: '#c1c1c6',
                    borderDash: [5, 5],
                    borderWidth: 1.5,
                    pointRadius: 0,
                    fill: false,
                    tension: 0.4
                },
                {
                    label: 'Ejecución Real',
                    data: realData,
                    borderColor: '#0055ff',
                    backgroundColor: realGradient,
                    borderWidth: 3,
                    tension: 0.4, // Suavizado premium
                    fill: true,   // Área sombreada suave
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

    // Limpiar campos
    document.getElementById('addFecha').valueAsDate = new Date();
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

    document.getElementById('addFecha').value = item.fecha;
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

    // Log intent
    addLog(`Iniciando eliminación del registro ID: ${id}...`, "info");

    try {
        const item = window.projectionData.find(p => p.id == id);
        const columnsToTry = [item?._idSource, 'id', 'ID', 'Id'].filter(c => c);
        const uniqueColumns = [...new Set(columnsToTry)];
        
        let success = false;
        let lastError = null;

        for (const col of uniqueColumns) {
            console.log(`Intentando eliminar usando columna: ${col}...`);
            const { error, count } = await supabaseClient
                .from('Estimacion')
                .delete({ count: 'exact' })
                .eq(col, id);

            if (!error && count > 0) {
                success = true;
                break;
            }
            if (error) {
                console.warn(`Fallo al eliminar con ${col}:`, error.message);
                lastError = error;
            }
        }

        if (!success) {
            const msg = lastError ? lastError.message : "No se encontró el registro para eliminar.";
            showToast(msg, 'warning');
            return;
        }

        addLog(`Registro ID: ${id} eliminado con éxito.`, "info");
        showToast("Registro eliminado con éxito");
        await fetchProjections();
    } catch (err) {
        console.error('Error crítico eliminando registro:', err);
        addLog(`Fallo de sistema: ${err.message}`, "error");
        showToast(`Error de sistema: ${err.message}`, 'error');
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
                    <span class="label">Mejor Grupo (Más Temprano)</span>
                    <span class="value best">${bestGroup.title} <small style="font-size: 0.7rem; font-weight: 400;">(${minutesToHHMM(bestGroup.currentAvg)})</small></span>
                </div>
                <div class="monitoring-kpi-card worst">
                    <span class="label">Peor Grupo (Más Tardío)</span>
                    <span class="value worst">${worstGroup.title} <small style="font-size: 0.7rem; font-weight: 400;">(${minutesToHHMM(worstGroup.currentAvg)})</small></span>
                </div>
                <div class="monitoring-kpi-card standard">
                    <span class="label">Promedio Global</span>
                    <span class="value standard">${minutesToHHMM(globalAvg)}</span>
                </div>
                <div class="monitoring-kpi-card standard">
                    <span class="label">Total Registros</span>
                    <span class="value standard">${totalRecords}</span>
                </div>
            </div>
        `;
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

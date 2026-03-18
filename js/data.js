const projectionData = [
    { fecha: "2026-02-02", tipo: "1er Hábil", diaSemana: "Lunes", horaMin: "04:20", horaMax: "04:50", horarioReal: "04:51:00", demoras: "00:04:00", horarioSindemora: "04:51:00", franjaSLO: "06:15", motivo: "" },
    { fecha: "2026-02-03", tipo: "2do Hábil", diaSemana: "Martes", horaMin: "03:30", horaMax: "04:00", horarioReal: "03:08:00", demoras: "00:00:00", horarioSindemora: "03:08:00", franjaSLO: "06:15", motivo: "" },
    { fecha: "2026-02-04", tipo: "Normal", diaSemana: "Miércoles", horaMin: "03:05", horaMax: "03:35", horarioReal: "03:11:00", demoras: "00:18:00", horarioSindemora: "03:03:00", franjaSLO: "06:15", motivo: "" },
    { fecha: "2026-02-05", tipo: "Normal", diaSemana: "Jueves", horaMin: "02:20", horaMax: "02:50", horarioReal: "03:24:00", demoras: "00:00:00", horarioSindemora: "03:24:00", franjaSLO: "06:15", motivo: "" },
    { fecha: "2026-02-06", tipo: "5to Hábil", diaSemana: "Viernes", horaMin: "04:35", horaMax: "05:05", horarioReal: "05:59:00", demoras: "00:45:00", horarioSindemora: "05:14:00", franjaSLO: "06:15", motivo: "" },
    { fecha: "2026-02-09", tipo: "Normal", diaSemana: "Lunes", horaMin: "02:50", horaMax: "03:20", horarioReal: "03:55:00", demoras: "00:15:00", horarioSindemora: "03:40:00", franjaSLO: "06:15", motivo: "" },
    { fecha: "2026-02-10", tipo: "Día 10", diaSemana: "Martes", horaMin: "03:30", horaMax: "04:00", horarioReal: "04:37:00", demoras: "00:52:00", horarioSindemora: "03:45:00", franjaSLO: "06:15", motivo: "" },
    { fecha: "2026-02-11", tipo: "Normal", diaSemana: "Miércoles", horaMin: "02:55", horaMax: "03:25", horarioReal: "03:21:00", demoras: "00:07:00", horarioSindemora: "03:14:00", franjaSLO: "06:15", motivo: "" },
    { fecha: "2026-02-12", tipo: "Normal", diaSemana: "Jueves", horaMin: "02:55", horaMax: "03:25", horarioReal: "02:52:00", demoras: "00:00:00", horarioSindemora: "02:52:00", franjaSLO: "06:15", motivo: "" },
    { fecha: "2026-02-13", tipo: "Pre-Feriado", diaSemana: "Viernes", horaMin: "05:50", horaMax: "06:20", horarioReal: "06:11:00", demoras: "00:21:00", horarioSindemora: "05:50:00", franjaSLO: "06:15", motivo: "" },
    { fecha: "2026-02-18", tipo: "Pos-Feriado", diaSemana: "Miércoles", horaMin: "04:25", horaMax: "04:55", horarioReal: "04:55:00", demoras: "00:12:00", horarioSindemora: "04:43:00", franjaSLO: "06:15", motivo: "" },
    { fecha: "2026-02-19", tipo: "Normal", diaSemana: "Jueves", horaMin: "02:30", horaMax: "03:00", horarioReal: "05:13:00", demoras: "02:15:00", horarioSindemora: "02:58:00", franjaSLO: "06:15", motivo: "" },
    { fecha: "2026-02-20", tipo: "Normal", diaSemana: "Viernes", horaMin: "05:15", horaMax: "05:45", horarioReal: "04:58:00", demoras: "00:00:00", horarioSindemora: "04:58:00", franjaSLO: "06:15", motivo: "" },
    { fecha: "2026-02-23", tipo: "Normal", diaSemana: "Lunes", horaMin: "02:30", horaMax: "03:00", horarioReal: "02:56:00", demoras: "00:00:00", horarioSindemora: "02:56:00", franjaSLO: "06:15", motivo: "" },
    { fecha: "2026-02-24", tipo: "Normal", diaSemana: "Martes", horaMin: "02:05", horaMax: "02:35", horarioReal: "02:18:00", demoras: "00:00:00", horarioSindemora: "02:18:00", franjaSLO: "06:15", motivo: "" },
    { fecha: "2026-02-25", tipo: "Normal", diaSemana: "Miércoles", horaMin: "01:30", horaMax: "02:00", horarioReal: "02:05:00", demoras: "00:06:00", horarioSindemora: "01:59:00", franjaSLO: "06:15", motivo: "" },
    { fecha: "2026-02-26", tipo: "Ante Último Hábil", diaSemana: "Jueves", horaMin: "02:35", horaMax: "03:05", horarioReal: "03:12:00", demoras: "00:26:00", horarioSindemora: "02:46:00", franjaSLO: "06:15", motivo: "" },
    { fecha: "2026-02-27", tipo: "Último Hábil", diaSemana: "Viernes", horaMin: "07:25", horaMax: "07:55", horarioReal: "07:49:00", demoras: "00:16:00", horarioSindemora: "07:33:00", franjaSLO: "06:15", motivo: "" },
    { fecha: "2026-03-02", tipo: "1er Hábil", diaSemana: "Lunes", horaMin: "00:00", horaMax: "00:00", horarioReal: "00:00:00", demoras: "00:00:00", horarioSindemora: "00:00:00", franjaSLO: "06:15", motivo: "" },
    { fecha: "2026-03-03", tipo: "2do Hábil", diaSemana: "Martes", horaMin: "03:05", horaMax: "03:35", horarioReal: "03:49:00", demoras: "00:00:00", horarioSindemora: "03:49:00", franjaSLO: "06:15", motivo: "" }
];

if (typeof window !== 'undefined') {
    window.projectionData = projectionData;
}

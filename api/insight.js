export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  const { kpis, demoras } = req.body;

  if (typeof kpis !== 'string' || typeof demoras !== 'string') {
    return res.status(400).json({ error: 'kpis and demoras must be strings' });
  }
  if (kpis.length > 4000 || demoras.length > 8000) {
    return res.status(400).json({ error: 'Input too large' });
  }

  let response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 700,
        system: 'Sos un analista de operaciones bancarias. Recibís KPIs y detalle de demoras del mes. Respondé SOLO con un objeto JSON válido, sin markdown, sin backticks, sin texto adicional antes ni después. El JSON debe tener exactamente esta estructura: {"resumen":"string de 2 oraciones máximo resumiendo el mes","metricas":[{"label":"string","valor":"string","tipo":"danger|warning|ok"}],"criticos":[{"nombre":"string","detalle":"string","demora":"string","severidad":"high|med"}],"observaciones":["string"]}. Reglas: metricas debe tener exactamente 3 items (ej: tasa de incidencia, procesos críticos, % del tiempo acumulado). criticos entre 2 y 4 items con los procesos de mayor demora. observaciones entre 2 y 4 strings; cada uno puede ser un patrón detectado o una recomendación concreta si aplica; no forzar recomendaciones si no hay claras. Español, tono directo.',
        messages: [{ role: 'user', content: `KPIs del período:\n${kpis}\n\nDetalle de demoras:\n${demoras}` }]
      })
    });
  } catch (err) {
    return res.status(502).json({ error: 'Failed to reach Anthropic API', detail: err.message });
  }

  if (!response.ok) {
    const errBody = await response.text();
    return res.status(response.status).json({ error: 'Anthropic API error', detail: errBody });
  }

  const data = await response.json();
  const text = data.content?.[0]?.text;
  if (!text) {
    return res.status(500).json({ error: 'Empty response from Anthropic', raw: data });
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (_) {
    return res.status(200).json({ insight: text });
  }

  res.status(200).json({ insight: parsed });
}

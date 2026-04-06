export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { kpis, demoras } = req.body;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      system: 'Sos un analista de operaciones bancarias. Recibís KPIs y el detalle de demoras del mes en curso. Generá un análisis corto (3-4 oraciones) identificando patrones, procesos más afectados y una recomendación concreta. Respondé en español, tono profesional y directo. No uses listas, solo prosa fluida.',
      messages: [{ role: 'user', content: `KPIs del período:\n${kpis}\n\nDetalle de demoras:\n${demoras}` }]
    })
  });

  const data = await response.json();
  const text = data.content?.[0]?.text || 'No se pudo generar el análisis.';
  res.status(200).json({ insight: text });
}

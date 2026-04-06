export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  const { kpis, demoras } = req.body;

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
        max_tokens: 300,
        system: 'Sos un analista de operaciones bancarias. Recibís KPIs y el detalle de demoras del mes en curso. Generá un análisis corto (3-4 oraciones) identificando patrones, procesos más afectados y una recomendación concreta. Respondé en español, tono profesional y directo. No uses listas, solo prosa fluida.',
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

  res.status(200).json({ insight: text });
}

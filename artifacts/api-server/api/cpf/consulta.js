import axios from 'axios';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const cpf = String(req.query.cpf || '').replace(/\D/g, '');
  if (cpf.length !== 11) return res.status(400).json({ error: 'CPF inválido' });
  try {
    const response = await axios.get(
      `https://renouvaslab.beauty/api/consulta.php?cpf=${cpf}`,
      { timeout: 10000 }
    );
    return res.json(response.data);
  } catch {
    return res.status(502).json({ error: 'Erro ao consultar CPF' });
  }
}

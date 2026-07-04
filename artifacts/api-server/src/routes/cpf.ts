import { Router } from "express";

const router = Router();

router.get("/cpf/consulta", async (req, res) => {
  const cpf = String(req.query.cpf || "").replace(/\D/g, "");
  if (cpf.length !== 11) {
    return res.status(400).json({ error: "CPF inválido" });
  }
  try {
    const response = await fetch(`https://api.amnesiatecnologia.rocks/?token=261207b9-0ec2-468a-ac04-f9d38a51da88&cpf=${cpf}`);
    const data = await response.json();
    return res.json(data);
  } catch (err) {
    return res.status(502).json({ error: "Erro ao consultar CPF" });
  }
});

export default router;

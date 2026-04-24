const express = require('express');
const router = express.Router({ mergeParams: true });
const pool = require('../db/connection');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

async function verificarNegocio(negocioId, usuarioId) {
  const r = await pool.query('SELECT id FROM negocios WHERE id=$1 AND usuario_id=$2', [negocioId, usuarioId]);
  return r.rows.length > 0;
}

// GET /api/negocios/:negocioId/despesas
router.get('/', async (req, res) => {
  try {
    if (!await verificarNegocio(req.params.negocioId, req.user.id)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    const result = await pool.query(
      'SELECT * FROM despesas WHERE negocio_id=$1 ORDER BY data_despesa DESC',
      [req.params.negocioId]
    );
    const total = await pool.query(
      'SELECT COALESCE(SUM(valor),0) as total FROM despesas WHERE negocio_id=$1',
      [req.params.negocioId]
    );
    res.json({ despesas: result.rows, total: total.rows[0].total });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar despesas' });
  }
});

// POST /api/negocios/:negocioId/despesas
router.post('/', async (req, res) => {
  const { descricao, valor, categoria, data_despesa } = req.body;
  if (!descricao || !valor) return res.status(400).json({ error: 'Descrição e valor são obrigatórios' });

  try {
    if (!await verificarNegocio(req.params.negocioId, req.user.id)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    const result = await pool.query(
      'INSERT INTO despesas (negocio_id, descricao, valor, categoria, data_despesa) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.params.negocioId, descricao, valor, categoria || '', data_despesa || new Date()]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao registrar despesa' });
  }
});

// DELETE /api/negocios/:negocioId/despesas/:id
router.delete('/:id', async (req, res) => {
  try {
    if (!await verificarNegocio(req.params.negocioId, req.user.id)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    await pool.query('DELETE FROM despesas WHERE id=$1 AND negocio_id=$2', [req.params.id, req.params.negocioId]);
    res.json({ message: 'Despesa removida' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao remover despesa' });
  }
});

module.exports = router;

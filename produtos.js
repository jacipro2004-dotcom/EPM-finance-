const express = require('express');
const router = express.Router({ mergeParams: true });
const pool = require('../db/connection');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// Verify business ownership
async function verificarNegocio(negocioId, usuarioId) {
  const r = await pool.query('SELECT id FROM negocios WHERE id=$1 AND usuario_id=$2', [negocioId, usuarioId]);
  return r.rows.length > 0;
}

// GET /api/negocios/:negocioId/produtos
router.get('/', async (req, res) => {
  try {
    if (!await verificarNegocio(req.params.negocioId, req.user.id)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    const result = await pool.query(
      `SELECT p.*,
        COALESCE((SELECT SUM(v.quantidade) FROM vendas v WHERE v.produto_id = p.id), 0) as total_vendido,
        COALESCE((SELECT SUM(v.lucro) FROM vendas v WHERE v.produto_id = p.id), 0) as lucro_total
       FROM produtos p WHERE p.negocio_id = $1 ORDER BY p.criado_em DESC`,
      [req.params.negocioId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar produtos' });
  }
});

// POST /api/negocios/:negocioId/produtos
router.post('/', async (req, res) => {
  const { nome, descricao, custo_unitario, preco_venda, quantidade_estoque, categoria, custos_detalhados } = req.body;
  if (!nome || !preco_venda) return res.status(400).json({ error: 'Nome e preço de venda são obrigatórios' });

  try {
    if (!await verificarNegocio(req.params.negocioId, req.user.id)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    const result = await pool.query(
      `INSERT INTO produtos (negocio_id, nome, descricao, custo_unitario, preco_venda, quantidade_estoque, categoria, custos_detalhados)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        req.params.negocioId, nome, descricao || '', 
        custo_unitario || 0, preco_venda,
        quantidade_estoque || 0, categoria || '',
        custos_detalhados ? JSON.stringify(custos_detalhados) : null
      ]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar produto' });
  }
});

// PUT /api/negocios/:negocioId/produtos/:id
router.put('/:id', async (req, res) => {
  const { nome, descricao, custo_unitario, preco_venda, quantidade_estoque, categoria, ativo, custos_detalhados } = req.body;
  try {
    if (!await verificarNegocio(req.params.negocioId, req.user.id)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    const result = await pool.query(
      `UPDATE produtos SET nome=$1, descricao=$2, custo_unitario=$3, preco_venda=$4,
       quantidade_estoque=$5, categoria=$6, ativo=$7, custos_detalhados=$8, atualizado_em=NOW()
       WHERE id=$9 AND negocio_id=$10 RETURNING *`,
      [nome, descricao, custo_unitario, preco_venda, quantidade_estoque, categoria,
       ativo !== undefined ? ativo : true,
       custos_detalhados ? JSON.stringify(custos_detalhados) : null,
       req.params.id, req.params.negocioId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Produto não encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar produto' });
  }
});

// DELETE /api/negocios/:negocioId/produtos/:id
router.delete('/:id', async (req, res) => {
  try {
    if (!await verificarNegocio(req.params.negocioId, req.user.id)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    await pool.query('DELETE FROM produtos WHERE id=$1 AND negocio_id=$2', [req.params.id, req.params.negocioId]);
    res.json({ message: 'Produto removido' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao remover produto' });
  }
});

module.exports = router;

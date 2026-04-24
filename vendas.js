const express = require('express');
const router = express.Router({ mergeParams: true });
const pool = require('../db/connection');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

async function verificarNegocio(negocioId, usuarioId) {
  const r = await pool.query('SELECT id FROM negocios WHERE id=$1 AND usuario_id=$2', [negocioId, usuarioId]);
  return r.rows.length > 0;
}

// GET /api/negocios/:negocioId/vendas
router.get('/', async (req, res) => {
  const { limit = 50, offset = 0, data_inicio, data_fim } = req.query;
  try {
    if (!await verificarNegocio(req.params.negocioId, req.user.id)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    let query = `SELECT v.*, p.nome as produto_nome_ref FROM vendas v
                 LEFT JOIN produtos p ON v.produto_id = p.id
                 WHERE v.negocio_id = $1`;
    const params = [req.params.negocioId];
    let idx = 2;

    if (data_inicio) { query += ` AND v.data_venda >= $${idx++}`; params.push(data_inicio); }
    if (data_fim) { query += ` AND v.data_venda <= $${idx++}`; params.push(data_fim); }

    query += ` ORDER BY v.data_venda DESC LIMIT $${idx++} OFFSET $${idx++}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);
    
    // Get totals
    const totais = await pool.query(
      'SELECT SUM(total) as total_vendas, SUM(lucro) as total_lucro, COUNT(*) as num_vendas FROM vendas WHERE negocio_id=$1',
      [req.params.negocioId]
    );
    
    res.json({ vendas: result.rows, totais: totais.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar vendas' });
  }
});

// POST /api/negocios/:negocioId/vendas
router.post('/', async (req, res) => {
  const { produto_id, nome_produto, quantidade, preco_unitario, custo_unitario, cliente, notas, data_venda } = req.body;
  
  if (!quantidade || !preco_unitario) {
    return res.status(400).json({ error: 'Quantidade e preço unitário são obrigatórios' });
  }

  try {
    if (!await verificarNegocio(req.params.negocioId, req.user.id)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    let custoUnit = custo_unitario || 0;
    let nomeProduto = nome_produto;

    // Se tem produto_id, busca dados do produto
    if (produto_id) {
      const prod = await pool.query('SELECT * FROM produtos WHERE id=$1 AND negocio_id=$2', [produto_id, req.params.negocioId]);
      if (prod.rows.length > 0) {
        custoUnit = custoUnit || prod.rows[0].custo_unitario;
        nomeProduto = nomeProduto || prod.rows[0].nome;
        
        // Atualizar estoque
        await pool.query(
          'UPDATE produtos SET quantidade_estoque = quantidade_estoque - $1 WHERE id = $2',
          [quantidade, produto_id]
        );
      }
    }

    const total = parseFloat(quantidade) * parseFloat(preco_unitario);
    const lucro = total - (parseFloat(custoUnit) * parseFloat(quantidade));

    const result = await pool.query(
      `INSERT INTO vendas (negocio_id, produto_id, nome_produto, quantidade, preco_unitario, custo_unitario, total, lucro, cliente, notas, data_venda)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [req.params.negocioId, produto_id || null, nomeProduto, quantidade, preco_unitario, custoUnit, total, lucro, cliente || '', notas || '', data_venda || new Date()]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao registrar venda' });
  }
});

// DELETE /api/negocios/:negocioId/vendas/:id
router.delete('/:id', async (req, res) => {
  try {
    if (!await verificarNegocio(req.params.negocioId, req.user.id)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    await pool.query('DELETE FROM vendas WHERE id=$1 AND negocio_id=$2', [req.params.id, req.params.negocioId]);
    res.json({ message: 'Venda removida' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao remover venda' });
  }
});

module.exports = router;

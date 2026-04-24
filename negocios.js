const express = require('express');
const router = express.Router();
const pool = require('../db/connection');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// GET /api/negocios
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT n.*, 
        COALESCE((SELECT SUM(v.total) FROM vendas v WHERE v.negocio_id = n.id), 0) as total_vendas,
        COALESCE((SELECT SUM(v.lucro) FROM vendas v WHERE v.negocio_id = n.id), 0) as total_lucro,
        COALESCE((SELECT COUNT(*) FROM vendas v WHERE v.negocio_id = n.id), 0) as num_vendas,
        COALESCE((SELECT COUNT(*) FROM produtos p WHERE p.negocio_id = n.id AND p.ativo = true), 0) as num_produtos
       FROM negocios n WHERE n.usuario_id = $1 ORDER BY n.criado_em DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar negócios' });
  }
});

// POST /api/negocios
router.post('/', async (req, res) => {
  const { nome, descricao, setor, moeda } = req.body;
  if (!nome) return res.status(400).json({ error: 'Nome é obrigatório' });

  try {
    const result = await pool.query(
      'INSERT INTO negocios (usuario_id, nome, descricao, setor, moeda) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [req.user.id, nome, descricao || '', setor || '', moeda || 'AOA']
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar negócio' });
  }
});

// PUT /api/negocios/:id
router.put('/:id', async (req, res) => {
  const { nome, descricao, setor, moeda, ativo } = req.body;
  try {
    const check = await pool.query('SELECT id FROM negocios WHERE id = $1 AND usuario_id = $2', [req.params.id, req.user.id]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Negócio não encontrado' });

    const result = await pool.query(
      'UPDATE negocios SET nome=$1, descricao=$2, setor=$3, moeda=$4, ativo=$5, atualizado_em=NOW() WHERE id=$6 RETURNING *',
      [nome, descricao, setor, moeda, ativo !== undefined ? ativo : true, req.params.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar negócio' });
  }
});

// DELETE /api/negocios/:id
router.delete('/:id', async (req, res) => {
  try {
    const check = await pool.query('SELECT id FROM negocios WHERE id = $1 AND usuario_id = $2', [req.params.id, req.user.id]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Negócio não encontrado' });

    await pool.query('DELETE FROM negocios WHERE id = $1', [req.params.id]);
    res.json({ message: 'Negócio removido com sucesso' });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao remover negócio' });
  }
});

// GET /api/negocios/:id/divisao
router.get('/:id/divisao', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM configuracoes_divisao WHERE negocio_id = $1', [req.params.id]);
    res.json(result.rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar configuração de divisão' });
  }
});

// POST/PUT /api/negocios/:id/divisao
router.post('/:id/divisao', async (req, res) => {
  const { nome_divisao, percentual_principal, percentual_secundario, nome_principal, nome_secundario } = req.body;
  try {
    const check = await pool.query('SELECT id FROM negocios WHERE id = $1 AND usuario_id = $2', [req.params.id, req.user.id]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Negócio não encontrado' });

    const result = await pool.query(
      `INSERT INTO configuracoes_divisao (negocio_id, nome_divisao, percentual_principal, percentual_secundario, nome_principal, nome_secundario)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (negocio_id) DO UPDATE SET
         nome_divisao=$2, percentual_principal=$3, percentual_secundario=$4, nome_principal=$5, nome_secundario=$6
       RETURNING *`,
      [req.params.id, nome_divisao || 'Divisão Principal', percentual_principal, percentual_secundario, nome_principal || 'Proprietário', nome_secundario || 'Parceiro']
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao salvar divisão' });
  }
});

module.exports = router;

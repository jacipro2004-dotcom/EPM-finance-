const express = require('express');
const router = express.Router({ mergeParams: true });
const pool = require('../db/connection');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

async function verificarNegocio(negocioId, usuarioId) {
  const r = await pool.query('SELECT * FROM negocios WHERE id=$1 AND usuario_id=$2', [negocioId, usuarioId]);
  return r.rows[0] || null;
}

// GET /api/negocios/:negocioId/relatorios/dashboard
router.get('/dashboard', async (req, res) => {
  try {
    const negocio = await verificarNegocio(req.params.negocioId, req.user.id);
    if (!negocio) return res.status(403).json({ error: 'Acesso negado' });

    const { periodo = '30' } = req.query;
    const dias = parseInt(periodo);

    // Totais gerais
    const totaisGerais = await pool.query(
      `SELECT 
        COALESCE(SUM(total), 0) as total_receita,
        COALESCE(SUM(lucro), 0) as total_lucro,
        COALESCE(SUM(quantidade), 0) as total_itens,
        COUNT(*) as num_transacoes
       FROM vendas WHERE negocio_id=$1`,
      [req.params.negocioId]
    );

    // Vendas por período
    const vendasPeriodo = await pool.query(
      `SELECT 
        COALESCE(SUM(total), 0) as receita,
        COALESCE(SUM(lucro), 0) as lucro,
        COUNT(*) as num_vendas
       FROM vendas WHERE negocio_id=$1 AND data_venda >= NOW() - INTERVAL '${dias} days'`,
      [req.params.negocioId]
    );

    // Vendas por dia (últimos 30 dias)
    const vendasPorDia = await pool.query(
      `SELECT 
        DATE(data_venda) as dia,
        SUM(total) as receita,
        SUM(lucro) as lucro,
        COUNT(*) as num_vendas
       FROM vendas 
       WHERE negocio_id=$1 AND data_venda >= NOW() - INTERVAL '30 days'
       GROUP BY DATE(data_venda)
       ORDER BY dia ASC`,
      [req.params.negocioId]
    );

    // Vendas por mês (últimos 12 meses)
    const vendasPorMes = await pool.query(
      `SELECT 
        TO_CHAR(data_venda, 'YYYY-MM') as mes,
        TO_CHAR(data_venda, 'Mon/YY') as mes_label,
        SUM(total) as receita,
        SUM(lucro) as lucro,
        COUNT(*) as num_vendas
       FROM vendas 
       WHERE negocio_id=$1 AND data_venda >= NOW() - INTERVAL '12 months'
       GROUP BY TO_CHAR(data_venda, 'YYYY-MM'), TO_CHAR(data_venda, 'Mon/YY')
       ORDER BY mes ASC`,
      [req.params.negocioId]
    );

    // Top produtos por receita
    const topProdutos = await pool.query(
      `SELECT 
        COALESCE(nome_produto, 'Produto sem nome') as nome,
        SUM(total) as receita,
        SUM(lucro) as lucro,
        SUM(quantidade) as quantidade,
        COUNT(*) as num_vendas
       FROM vendas WHERE negocio_id=$1
       GROUP BY nome_produto
       ORDER BY receita DESC LIMIT 10`,
      [req.params.negocioId]
    );

    // Top produtos por lucro
    const topProdutosLucro = await pool.query(
      `SELECT 
        COALESCE(nome_produto, 'Produto sem nome') as nome,
        SUM(lucro) as lucro,
        SUM(total) as receita,
        SUM(quantidade) as quantidade
       FROM vendas WHERE negocio_id=$1
       GROUP BY nome_produto
       ORDER BY lucro DESC LIMIT 5`,
      [req.params.negocioId]
    );

    // Configuração de divisão
    const divisao = await pool.query(
      'SELECT * FROM configuracoes_divisao WHERE negocio_id=$1', [req.params.negocioId]
    );

    const lucroTotal = parseFloat(totaisGerais.rows[0].total_lucro);
    const divConf = divisao.rows[0];
    let divisaoLucro = null;
    if (divConf) {
      divisaoLucro = {
        config: divConf,
        valor_principal: (lucroTotal * divConf.percentual_principal / 100),
        valor_secundario: (lucroTotal * divConf.percentual_secundario / 100),
      };
    }

    // Sugestões inteligentes
    const sugestoes = [];
    
    // Produto com margem baixa
    const margemBaixa = await pool.query(
      `SELECT nome_produto, AVG((lucro/NULLIF(total,0))*100) as margem_media
       FROM vendas WHERE negocio_id=$1
       GROUP BY nome_produto
       HAVING AVG((lucro/NULLIF(total,0))*100) < 20 AND COUNT(*) > 2
       ORDER BY margem_media ASC LIMIT 3`,
      [req.params.negocioId]
    );
    
    if (margemBaixa.rows.length > 0) {
      sugestoes.push({
        tipo: 'aviso',
        titulo: 'Margem baixa detectada',
        mensagem: `${margemBaixa.rows[0].nome_produto} tem margem média de ${parseFloat(margemBaixa.rows[0].margem_media).toFixed(1)}%. Considere revisar o preço.`
      });
    }

    // Produto mais lucrativo
    if (topProdutosLucro.rows.length > 0) {
      sugestoes.push({
        tipo: 'sucesso',
        titulo: 'Produto estrela',
        mensagem: `"${topProdutosLucro.rows[0].nome}" é seu produto mais lucrativo. Considere aumentar o estoque.`
      });
    }

    // Vendas crescendo
    const comparativo = await pool.query(
      `SELECT 
        SUM(CASE WHEN data_venda >= NOW() - INTERVAL '15 days' THEN total ELSE 0 END) as ultimos15,
        SUM(CASE WHEN data_venda < NOW() - INTERVAL '15 days' AND data_venda >= NOW() - INTERVAL '30 days' THEN total ELSE 0 END) as anteriores15
       FROM vendas WHERE negocio_id=$1`,
      [req.params.negocioId]
    );
    
    const { ultimos15, anteriores15 } = comparativo.rows[0];
    if (parseFloat(ultimos15) > parseFloat(anteriores15) * 1.1) {
      sugestoes.push({
        tipo: 'info',
        titulo: 'Crescimento detectado!',
        mensagem: `Suas vendas cresceram ${(((ultimos15/anteriores15)-1)*100).toFixed(0)}% nos últimos 15 dias. Continue assim!`
      });
    }

    res.json({
      negocio,
      periodo: dias,
      totais_gerais: totaisGerais.rows[0],
      periodo_atual: vendasPeriodo.rows[0],
      vendas_por_dia: vendasPorDia.rows,
      vendas_por_mes: vendasPorMes.rows,
      top_produtos: topProdutos.rows,
      top_produtos_lucro: topProdutosLucro.rows,
      divisao_lucro: divisaoLucro,
      sugestoes
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao gerar relatório' });
  }
});

// GET /api/negocios/:negocioId/relatorios/ranking
router.get('/ranking', async (req, res) => {
  try {
    if (!await verificarNegocio(req.params.negocioId, req.user.id)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }

    const rankingReceita = await pool.query(
      `SELECT nome_produto as nome, SUM(total) as valor, SUM(quantidade) as qtd,
        RANK() OVER (ORDER BY SUM(total) DESC) as posicao
       FROM vendas WHERE negocio_id=$1
       GROUP BY nome_produto ORDER BY valor DESC LIMIT 20`,
      [req.params.negocioId]
    );

    const rankingLucro = await pool.query(
      `SELECT nome_produto as nome, SUM(lucro) as valor, SUM(total) as receita,
        RANK() OVER (ORDER BY SUM(lucro) DESC) as posicao
       FROM vendas WHERE negocio_id=$1
       GROUP BY nome_produto ORDER BY valor DESC LIMIT 20`,
      [req.params.negocioId]
    );

    const rankingQtd = await pool.query(
      `SELECT nome_produto as nome, SUM(quantidade) as valor,
        RANK() OVER (ORDER BY SUM(quantidade) DESC) as posicao
       FROM vendas WHERE negocio_id=$1
       GROUP BY nome_produto ORDER BY valor DESC LIMIT 20`,
      [req.params.negocioId]
    );

    res.json({ ranking_receita: rankingReceita.rows, ranking_lucro: rankingLucro.rows, ranking_quantidade: rankingQtd.rows });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao gerar ranking' });
  }
});

module.exports = router;

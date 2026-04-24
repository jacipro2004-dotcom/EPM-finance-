-- EMP Finance Database Schema
-- Execute este arquivo no PostgreSQL para criar todas as tabelas

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tabela de usuários
CREATE TABLE IF NOT EXISTS usuarios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    senha_hash VARCHAR(255) NOT NULL,
    plano VARCHAR(50) DEFAULT 'basico',
    criado_em TIMESTAMP DEFAULT NOW(),
    atualizado_em TIMESTAMP DEFAULT NOW()
);

-- Tabela de negócios
CREATE TABLE IF NOT EXISTS negocios (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    descricao TEXT,
    setor VARCHAR(100),
    moeda VARCHAR(10) DEFAULT 'AOA',
    ativo BOOLEAN DEFAULT true,
    criado_em TIMESTAMP DEFAULT NOW(),
    atualizado_em TIMESTAMP DEFAULT NOW()
);

-- Tabela de produtos
CREATE TABLE IF NOT EXISTS produtos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    negocio_id UUID NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    descricao TEXT,
    custo_unitario DECIMAL(15,2) DEFAULT 0,
    preco_venda DECIMAL(15,2) NOT NULL,
    quantidade_estoque INTEGER DEFAULT 0,
    categoria VARCHAR(100),
    ativo BOOLEAN DEFAULT true,
    custos_detalhados JSONB,
    criado_em TIMESTAMP DEFAULT NOW(),
    atualizado_em TIMESTAMP DEFAULT NOW()
);

-- Tabela de vendas
CREATE TABLE IF NOT EXISTS vendas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    negocio_id UUID NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
    produto_id UUID REFERENCES produtos(id) ON DELETE SET NULL,
    nome_produto VARCHAR(255),
    quantidade INTEGER NOT NULL DEFAULT 1,
    preco_unitario DECIMAL(15,2) NOT NULL,
    custo_unitario DECIMAL(15,2) DEFAULT 0,
    total DECIMAL(15,2) NOT NULL,
    lucro DECIMAL(15,2) DEFAULT 0,
    cliente VARCHAR(255),
    notas TEXT,
    data_venda TIMESTAMP DEFAULT NOW(),
    criado_em TIMESTAMP DEFAULT NOW()
);

-- Tabela de configurações de divisão de lucro
CREATE TABLE IF NOT EXISTS configuracoes_divisao (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    negocio_id UUID NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
    nome_divisao VARCHAR(100) NOT NULL,
    percentual_principal DECIMAL(5,2) NOT NULL,
    percentual_secundario DECIMAL(5,2) NOT NULL,
    nome_principal VARCHAR(100) DEFAULT 'Proprietário',
    nome_secundario VARCHAR(100) DEFAULT 'Parceiro',
    ativo BOOLEAN DEFAULT true,
    criado_em TIMESTAMP DEFAULT NOW(),
    UNIQUE(negocio_id)
);

-- Tabela de despesas
CREATE TABLE IF NOT EXISTS despesas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    negocio_id UUID NOT NULL REFERENCES negocios(id) ON DELETE CASCADE,
    descricao VARCHAR(255) NOT NULL,
    valor DECIMAL(15,2) NOT NULL,
    categoria VARCHAR(100),
    data_despesa TIMESTAMP DEFAULT NOW(),
    criado_em TIMESTAMP DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_negocios_usuario ON negocios(usuario_id);
CREATE INDEX IF NOT EXISTS idx_produtos_negocio ON produtos(negocio_id);
CREATE INDEX IF NOT EXISTS idx_vendas_negocio ON vendas(negocio_id);
CREATE INDEX IF NOT EXISTS idx_vendas_data ON vendas(data_venda);
CREATE INDEX IF NOT EXISTS idx_despesas_negocio ON despesas(negocio_id);

-- Dados de exemplo (opcional - remover em produção)
-- INSERT INTO usuarios (nome, email, senha_hash) VALUES ('Admin EMP', 'admin@emp.ao', '$2b$10$...');

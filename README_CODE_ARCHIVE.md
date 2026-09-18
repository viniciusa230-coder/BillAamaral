# Arquivo completo do LicitaGestão

Este repositório mantém o código atual na raiz e o histórico de desenvolvimento organizado por pastas.

## Estrutura
- `index.html`, `api/analisar-link.js`, `package.json`, `vercel.json`: snapshot da versão de produção capturada em 18/09/2026.
- `versions/7_6/`: versão 7.6.0.
- `versions/7_6_1/`: versão 7.6.1.
- `versions/7_6_2/`: versão 7.6.2.
- `versions/7_6_3/`: versão 7.6.3.
- `versions/7_7_0/`: versão 7.7.0 com agenda e pipeline.
- `prototypes/`: protótipos intermediários do modal e pipeline.
- `legacy/mvp/`: MVP inicial e schema SQL.
- `legacy/correcao-importacao-municipal/`: correção e testes do importador municipal.

## Segurança
Arquivos de ambiente, tokens, `.vercel`, credenciais e segredos não são versionados.

## Persistência local
As versões do sistema usam a chave `licitagestao.v5` no `localStorage`; preserve-a ao evoluir a aplicação.

# LicitaGestão — código e histórico

Este repositório contém o código do LicitaGestão disponível nesta conversa.

## Código atual na raiz

Os arquivos abaixo estão diretamente navegáveis e correspondem ao snapshot da aplicação usado como base de produção:

- `index.html`
- `api/analisar-link.js`
- `package.json`
- `vercel.json`

A aplicação preserva os dados locais usando a chave `licitagestao.v5` no `localStorage`. Não altere essa chave sem uma migração explícita.

## Histórico integral

Todo o restante do código histórico disponível — versões 7.6.0, 7.6.1, 7.6.2, 7.6.3, 7.7.0, protótipos, MVP, schema SQL, correções do importador municipal e testes — está preservado integralmente em:

`archives/LicitaGestao_Todo_Codigo_Historico.tar.xz.b64.part00`
até
`archives/LicitaGestao_Todo_Codigo_Historico.tar.xz.b64.part05`

Use `archives/README.md` para reconstruir o arquivo e `archives/MANIFEST.md` para conferir o SHA-256 e a relação completa dos 44 arquivos incluídos.

## Segurança

Não foram versionados:
- arquivos `.env`;
- tokens;
- credenciais;
- diretório `.vercel`;
- outros segredos de ambiente.

O objetivo é permitir que outro agente ou desenvolvedor continue o sistema sem expor credenciais.

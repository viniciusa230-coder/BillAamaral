# Como carregar todo o LicitaGestao no Monkey Code

Este repositório contém:

- produção atual na raiz: `index.html`, `api/analisar-link.js`, `package.json`, `vercel.json`;
- backup integral do histórico em `archives/`;
- scripts de restauração na raiz.

## Linux / Monkey Code

Depois de clonar o repositório:

```bash
bash restore-all-code.sh
```

Depois disso aparecerão:

- `versions/` — versões 7.6, 7.6.1, 7.6.2, 7.6.3 e 7.7.0;
- `prototypes/` — versões intermediárias de modal e pipeline;
- `legacy/` — MVP inicial, schema SQL e correção do importador municipal.

## Windows PowerShell

```powershell
.\restore-all-code.ps1
```

## Importante

A persistência do sistema usa a chave `licitagestao.v5` no localStorage. Preserve essa chave.

Nenhum arquivo `.env`, token, credencial ou diretório `.vercel` foi incluído.

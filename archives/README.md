# Arquivo integral do histórico de código

Os arquivos `LicitaGestao_Todo_Codigo_Historico.tar.xz.b64.part00` até `part05` formam, em ordem, um arquivo `tar.xz` contendo todo o código-fonte histórico disponível nesta conversa (versões, protótipos, MVP e correções).

## Reconstruir no PowerShell

```powershell
$parts = Get-ChildItem "LicitaGestao_Todo_Codigo_Historico.tar.xz.b64.part*" | Sort-Object Name
$b64 = ($parts | ForEach-Object { Get-Content $_ -Raw }) -join ""
[IO.File]::WriteAllBytes("LicitaGestao_Todo_Codigo_Historico.tar.xz",[Convert]::FromBase64String($b64))
```

## Reconstruir em Linux/macOS

```bash
cat LicitaGestao_Todo_Codigo_Historico.tar.xz.b64.part* | base64 -d > LicitaGestao_Todo_Codigo_Historico.tar.xz
tar -xJf LicitaGestao_Todo_Codigo_Historico.tar.xz
```

Nenhum token, arquivo `.env`, credencial ou diretório `.vercel` foi incluído.

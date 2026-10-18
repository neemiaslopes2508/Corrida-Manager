# Consolidação dos diretórios do Corrida Manager

Data: 2026-10-18

## Diretório oficial

```text
C:\Projetos\CorridaManager
```

O diretório com espaço (`C:\Projetos\Corrida Manager`) era o diretório de trabalho da sessão do OpenCode, não uma segunda cópia do jogo.

## Auditoria

Conteúdo encontrado no diretório secundário:

| Item | Quantidade |
| --- | ---: |
| `.playwright-mcp/` | 84 arquivos |
| `media-menu.png` | 1 arquivo |
| **Total** | **85 arquivos** |

Os 84 arquivos de `.playwright-mcp` são snapshots YAML, screenshots PNG e logs de console gerados durante validações de navegador. Nenhum arquivo existia no diretório oficial antes da consolidação; portanto, não houve conflito de nomes ou conteúdos.

Antes desta consolidação, não foram encontradas referências absolutas a `C:\Projetos\Corrida Manager` nos scripts, configurações, iniciadores, README ou documentação do projeto. Os dois iniciadores usam `cd /d "%~dp0"` e permanecem relativos à própria pasta. As únicas ocorrências atuais do caminho com espaço estão neste documento e no README da captura, como registro histórico.

### Causa dos artefatos no diretório secundário

O Playwright MCP grava em `.playwright-mcp` relativo ao diretório da sessão do OpenCode. O log do OpenCode registrava:

```text
mcp connected ... server=playwright directory="C:\\Projetos\\Corrida Manager"
```

Ou seja, a sessão estava aberta no diretório secundário. O `opencode.json` global não contém caminho fixo para o Playwright.

## Consolidação

### Backup

Backup integral, com hashes SHA-256 e estrutura relativa preservada:

```text
C:\Projetos\CorridaManager\backups\secondary-corrida-manager-20261018-195255\
```

Conteúdo:

- 85 arquivos copiados e verificados;
- `BACKUP-MANIFEST.json` com caminho relativo, tamanho e SHA-256 de cada arquivo;
- `.playwright-mcp/` preservado dentro do backup.

### Artefatos incorporados

| Origem | Destino |
| --- | --- |
| `C:\Projetos\Corrida Manager\.playwright-mcp\*` | `C:\Projetos\CorridaManager\.playwright-mcp\*` |
| `C:\Projetos\Corrida Manager\media-menu.png` | `C:\Projetos\CorridaManager\docs\screenshots\media-menu.png` |

- 84/84 arquivos do Playwright copiados com hash idêntico.
- Nenhum arquivo existente foi sobrescrito.
- Nenhum nome precisou ser renomeado por conflito.
- `media-menu.png` preservado com SHA-256 `7513BAC0AD03EEAD338E66165C6CCB6A0603FA2C01428F6DB1BC8BB1006B4795`.

## Correção de caminho

A sessão atual do OpenCode foi movida para:

```text
C:\Projetos\CorridaManager
```

Após a mudança, o MCP reconectou com:

```text
server=playwright directory="C:\\Projetos\\CorridaManager"
```

Um teste simples do Playwright gerou novos snapshots e screenshot em:

```text
C:\Projetos\CorridaManager\.playwright-mcp\
```

Nenhum artefato novo foi criado no diretório secundário durante o teste. Para manter esse comportamento, abra o OpenCode a partir do diretório oficial.

## Git

Foram adicionados ao `.gitignore`:

```text
.playwright-mcp/
backups/
```

A pasta `docs/screenshots/` permanece fora do ignore porque contém a captura preservada e sua documentação.

## Validação

| Verificação | Resultado |
| --- | --- |
| Hashes origem × backup × consolidado | 85/85 arquivos idênticos |
| `.playwright-mcp` oficial | 84 arquivos consolidados + 2 artefatos do teste de caminho |
| Screenshot `media-menu.png` | SHA-256 idêntico ao original |
| Playwright após mover a sessão | novos arquivos gerados no `.playwright-mcp` oficial |
| Diretório secundário após o teste | inalterado, sem arquivos novos |
| `npm run typecheck` | aprovado |
| `npm run build` | aprovado |
| Sintaxe de `scripts/*.mjs` | aprovada |
| Servidor local em porta de teste 8791 | `/api/health` respondeu `ok: true`; encerrado em seguida |
| Dados de teste do servidor | `CM_DATA_DIR` apontado para pasta temporária, sem tocar em saves/salas |
| Iniciadores `.bat` | ambos usam `cd /d "%~dp0"` |
| Script online | configuração e sintaxe verificadas sem abrir túnel público |

## Diretório secundário

O diretório `C:\Projetos\Corrida Manager` não foi excluído, movido nem alterado. Ele permanece com os 85 arquivos originais. Sua exclusão depende de autorização explícita.

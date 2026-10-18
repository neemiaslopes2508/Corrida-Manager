# Multiplayer â€” arquitetura, internet e operaÃ§Ã£o

## Modelo

- O host executa Node.js + `ws` + HTTP estÃ¡tico na porta 8787.
- O servidor Ã© autoritativo: cria a carreira, simula treino/classificaÃ§Ã£o/corrida, valida comandos e grava resultados.
- Os clientes React enviam mensagens JSON e recebem snapshots. Nenhum cliente executa a simulaÃ§Ã£o no multiplayer.
- AtÃ© trÃªs jogadores humanos; as demais equipes sÃ£o IA.
- Cada jogador sÃ³ pode comandar pilotos da prÃ³pria equipe.
- Cada cliente recebe `RaceView.playerTeams` com apenas a prÃ³pria equipe; os painÃ©is de estratÃ©gia dos outros nÃ£o aparecem.
- Apenas o host (primeiro jogador da sala) avanÃ§a sessÃµes, pausa, retoma e muda a velocidade.

## Online em um comando

```powershell
cd C:\Projetos\CorridaManager
npm run online
```

O `scripts/online.mjs`:

1. exige o build do cliente (`npm run build` jÃ¡ Ã© executado pelo script npm);
2. inicia `server/index.ts` em `0.0.0.0:8787`;
3. procura `cloudflared` no PATH, em `CLOUDFLARED_PATH` ou baixa o binÃ¡rio oficial para `tools/`;
4. executa `cloudflared tunnel --url http://127.0.0.1:8787 --no-autoupdate`;
5. extrai o link `https://*.trycloudflare.com`;
6. grava o link em `data/public-url.txt`;
7. valida `GET /api/health` pÃºblico e um handshake **WSS** com `ping/pong`;
8. imprime o link a compartilhar e mantÃ©m tudo ativo atÃ© `Ctrl+C`.

O link Ã© HTTPS; o navegador abre `https://...` e o cliente escolhe automaticamente `wss://.../ws` usando `location.host`. NÃ£o hÃ¡ URL fixa de localhost no bundle.

### LimitaÃ§Ãµes do Quick Tunnel

- O link muda a cada reinÃ­cio do host.
- Ã‰ um serviÃ§o gratuito e temporÃ¡rio, sem SLA, com limites de trÃ¡fego.
- Tokens de reconexÃ£o ficam no `localStorage` da origem; se o link mudar, eles pertencem Ã  origem antiga. Mantenha o host/tÃºnel ativos durante a sessÃ£o.
- Para link estÃ¡vel seria necessÃ¡rio um domÃ­nio + named tunnel (nÃ£o incluÃ­do, pois exigiria conta/domÃ­nio).

### VariÃ¡veis

| VariÃ¡vel | Efeito |
| --- | --- |
| `PORT` | porta local (padrÃ£o 8787) |
| `HOST` | interface de escuta (padrÃ£o 0.0.0.0) |
| `PUBLIC_URL` | origem pÃºblica esperada; tambÃ©m exibida no log |
| `ALLOWED_ORIGINS` | origens extras separadas por vÃ­rgula |
| `CLOUDFLARED_PATH` | caminho de um cloudflared jÃ¡ instalado |
| `CLOUDFLARED_PROTOCOL` | `http2` para redes que bloqueiam QUIC/UDP |
| `CM_ALLOW_ANY_ORIGIN=1` | **somente desenvolvimento local** |
| `CM_ALLOW_NO_ORIGIN=1` | **somente testes/ferramentas**, nÃ£o usar em produÃ§Ã£o |
| `CM_EXPOSE_ROOMS=1` | habilita a listagem pÃºblica de salas (desligada por seguranÃ§a) |
| `CM_RACE_LAPS` | somente testes automatizados; encurta a corrida |

## Protocolo (resumo)

Cliente â†’ servidor:

- `create_room`, `join_room`, `reconnect`
- `pick_team`, `set_ready`, `start_career`
- `career_action` (preparaÃ§Ã£o, treino, classificaÃ§Ã£o, corrida, gestÃ£o)
- `race_command` (ritmo, energia, pneus, pit)
- `race_control` (pause/resume/speed, somente host)
- `leave`, `ping`

Servidor â†’ cliente:

- `room_state`, `career_state`
- `race_started`, `race_view`, `race_finished`
- `error`, `saved`, `pong`

`race_view` Ã© enviado a cada ~120 ms. O loop de simulaÃ§Ã£o roda a cada 50 ms e consome passos fixos de 250 ms multiplicados pela velocidade do host (1â€“50x).

## SeguranÃ§a bÃ¡sica

- Handshake WebSocket valida `Origin`:
  - mesma origem de `Host`;
  - `PUBLIC_URL`;
  - entradas de `ALLOWED_ORIGINS`;
  - loopback para desenvolvimento.
- Handshake sem `Origin` Ã© rejeitado, exceto com `CM_ALLOW_NO_ORIGIN=1`.
- Tokens aleatÃ³rios de 18 bytes (36 hex, 144 bits) identificam o assento na reconexÃ£o.
- Token nÃ£o aparece em `room_state` pÃºblico/broadcast; sÃ³ Ã© enviado ao prÃ³prio jogador no `sendAuth`.
- Comandos validam dono da equipe e papel de host no servidor.
- Payload mÃ¡ximo padrÃ£o de 64 KiB, limite de 400 mensagens/10 s por socket, heartbeat de 30 s e timeout de 10 s.
- CÃ³digos de sala sÃ£o validados (`4â€“8` caracteres alfanumÃ©ricos) antes de busca.
- NÃ£o hÃ¡ autenticaÃ§Ã£o de conta, anti-cheat criptogrÃ¡fico nem rate limit por IP atrÃ¡s do tÃºnel (todos chegam pelo loopback). Para V1 local, essas medidas sÃ£o proporcionais.

## ReconexÃ£o

- Ao criar/entrar, o servidor devolve um token aleatÃ³rio.
- O cliente guarda `cm-room-<CODIGO>` e `cm-last-room` no navegador.
- Ao cair, o `MPClient` tenta reconectar com backoff exponencial (1â€“15 s + jitter), timeout de handshake de 15 s e retoma ao voltar para a aba.
- O App reenvia `reconnect` com o token quando a conexÃ£o volta a abrir.
- O servidor mantÃ©m o assento e marca `connected`.
- Uma corrida em andamento continua no servidor mesmo sem clientes; ao reconectar, o cliente recebe o snapshot atual.
- Se a conexÃ£o cair e o token estiver presente, a reconexÃ£o Ã© automÃ¡tica. Se a pÃ¡gina for recarregada, use **Reconectar** na sala.

## Salvamento e retomada

- Cada sala Ã© gravada em `data/rooms/<CODIGO>.json` apÃ³s aÃ§Ãµes, controles, fim de corrida e periodicamente durante a prova.
- O arquivo contÃ©m jogadores, tokens, carreira, corrida em andamento, velocidade e pausa.
- Ao iniciar, o servidor carrega todas as salas. Jogadores entram como desconectados e a corrida retoma pausada.
- O host reconecta, retoma a corrida e continua.
- Para limpar tudo, pare o servidor e remova `data/rooms/`.

## LAN

1. Descubra o IPv4 do host (`ipconfig` no Windows, `ip addr` no Linux).
2. Libere a porta 8787 no firewall local, se necessÃ¡rio.
3. Compartilhe `http://IP:8787`.
4. Clientes na mesma rede abrem no navegador.

## Internet sem Quick Tunnel

- Cloudflare Tunnel manual: `cloudflared tunnel --url http://localhost:8787`.
- Tailscale: `tailscale up` no host e nos clientes; use o IP 100.x com a porta 8787.
- Ambos suportam upgrade de WebSocket. NÃ£o configure encaminhamento de porta pÃºblica sem entender os riscos.

## ValidaÃ§Ã£o em nÃ­veis

1. **Automatizada local** â€” trÃªs clientes `ws`, trÃªs equipes, comandos, pausa, estado idÃªntico e fim de corrida (`npm test`).
2. **TÃºnel pÃºblico** â€” `npm run online` valida HTTP pÃºblico e WSS pÃºblico com `Origin` do link. Para exercitar uma corrida completa com trÃªs clientes pelo link:

   ```powershell
   npm run check:public -- https://SEU-LINK.trycloudflare.com
   ```

   Isso usa trÃªs sockets externos via Cloudflare, mas ainda na mesma mÃ¡quina/rede de origem. Para encurtar, inicie o host com `CM_RACE_LAPS=4`.
3. **UsuÃ¡rios reais externos** â€” somente caracteriza validaÃ§Ã£o real quando pessoas em outra rede/cidade abrirem o link, criarem/entrarem na sala e disputarem a corrida. Registre o resultado separadamente; testes locais nÃ£o substituem essa etapa.

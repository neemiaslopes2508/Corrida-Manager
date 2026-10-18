# Checkpoint de desenvolvimento — V1

Atualizado em 2026-10-18.

## Estado

- [x] A. Ambiente, dados e assets
- [x] B. Motor de simulação e regulamentos
- [x] C. Sessões e carreira
- [x] D. Gestão da equipe
- [x] E. Visualização e controles
- [x] F. Multiplayer
- [x] G. Integração, testes e correções

## Verificado nesta sessão

- Build TypeScript + Vite sem erros.
- 19 testes automatizados aprovados (`npm test`).
- Carreira solo completa (Austrália, China com Sprint, Japão) via UI, com campeões.
- Corrida ao vivo com mapa SVG, marcadores, torre, telemetria, estratégia e feed.
- Pit stops, compostos, penalidades, Safety Car e clima em execução.
- Gestão: desenvolvimento imediato/padrão, renovação, patrocínio, contratação de staff, componentes e lançamentos financeiros.
- Salvamento/carregamento de carreira solo no navegador.
- Servidor autoritativo com três clientes WebSocket, reconexão, comandos privados, pausa/velocidade do host e conclusão da corrida.
- Sala/lobby com seleção sem duplicação, prontidão e início pelo host.
- Três contextos de navegador verificados no lobby/início de carreira com equipes distintas; a sincronização exata da corrida entre três clientes é coberta pelo teste de integração WebSocket.
- Multiplayer online com Cloudflare Quick Tunnel: `npm run online`, link HTTPS/WSS, validação automática de HTTP e WSS públicos. Teste público com três sockets (criar sala, três equipes, reconexão por token, comando, pausa/estado idêntico e corrida curta concluída) aprovado.
- Navegador real aberto pelo link público, criando sala e conectando WSS sem erros de console.
- Validação de `Origin`, rejeição de origem desconhecida e de handshake sem `Origin`, tokens de 144 bits, rate limit, payload máximo e heartbeat.
- Iniciadores Windows `Corrida Manager - Local.bat` e `Corrida Manager - Online.bat` validados por duplo clique a partir de outro diretório: verificam Node.js 20+, dependências, evitam servidor duplicado, mantêm a janela aberta, abrem o navegador e encerram servidor/túnel ao fechar.
- Mídia local 2026: 22 retratos PNG e 11 logos SVG copiados do FM26, associados por IDs estáveis, com manifest, fallback, `npm run check:media` e diretório fora do Git.
- Retratos/logos integrados em seleção de equipe, lobby, dashboard, gestão de pilotos, qualificação, campeonato, resultados, fim de temporada e corrida ao vivo.
- Tela de corrida revalidada sem scroll vertical em 1280×720, 1366×768 e 1920×1080; logos/retratos pequenos não alteraram o layout full-screen.
- Fallback de retrato testado no navegador ao forçar um caminho ausente.
- Diretórios consolidados em `C:\Projetos\CorridaManager`: 85 arquivos do diretório secundário copiados para backup verificado, `.playwright-mcp/` e `docs/screenshots/`; sessão OpenCode/Playwright redirecionada para o diretório oficial.

## Pendências conhecidas

- Um teste manual de corrida completa com três contextos de navegador não foi repetido após a última alteração; o teste de integração e o teste público com três clientes cobrem pausa sincronizada, estado idêntico, comandos autoritativos e fim da corrida.
- **Validação com usuários reais em outra rede/cidade ainda não foi executada.** O teste de túnel público foi feito na mesma máquina/rede de origem; comprova HTTPS/WSS públicos, mas não substitui pessoas externas.
- Retratos/logos oficiais existem apenas como mídia local privada, fora do Git; a licença de redistribuição não foi confirmada e o diretório/build com esses arquivos não deve ser publicado.
- Sem áudio.
- A pista de Madrid e as demais etapas do calendário 2026 não entram na V1 de três etapas.
- Quick Tunnel é temporário e o link muda ao reiniciar; tokens de reconexão são por origem.

## Como retomar

1. `npm install` se `node_modules` não existir.
2. `npm run dev` ou `npm run build && npm start`.
3. `npm run online` para internet com link público.
4. `npm test` para validar o motor.
5. `npm run check:public -- https://SEU-LINK.trycloudflare.com` para repetir o teste público.
6. Ver `README.md`, `docs/MULTIPLAYER.md`, `docs/MEDIA.md`, `docs/CONSOLIDACAO_DIRETORIOS.md` e `docs/REGULAMENTO_E_BALANCEAMENTO.md`.
7. Rodar `npm run check:media` se a pasta `public/local-media` for restaurada ou alterada.

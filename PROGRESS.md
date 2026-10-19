# Checkpoint de desenvolvimento — V1.3.3

Atualizado em 2026-10-19.

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
- 33 testes automatizados aprovados (`npm test`).
- Classificação interativa Q1/Q2/Q3 e SQ1/SQ2/SQ3 com relógio, múltiplas tentativas, pneus, combustível, tráfego, evolução da pista, chuva, setores, mapa e IA.
- Servidor autoritativo de classificação com comandos privados, pausa/velocidade, avanço de segmento, simulação restante, reconexão e três jogadores enviando carros.
- Saves V1/V1.2 migrados para `CAREER_VERSION` 3; resultados legados continuam abrindo e sessões sem resultado são retomadas.
- Classificação validada no navegador em 1280×720, 1366×768 e 1920×1080 sem rolagem vertical: pausa, 50x, envio aos boxes, mapa, torre, relógio, Q1→Q2, resultado final e início da corrida com o grid definido.
- V1.3: planejador de stints antes da corrida, projeções de desgaste/tempo/risco, janelas de pit, estoque integrado com a classificação, combustível sem reabastecimento e recomendações do engenheiro.
- V1.3: undercut/overcut determinísticos, IA com planos e cobertura, pit loss estimado pela geometria real, separação entre estrategista e equipe de pit, e Safety Car/VSC com duração por voltas.
- V1.3: comandos de estratégia versionados, visão privada de planos/inventário/recomendações no multiplayer e migração `CAREER_VERSION 3`.
- Corrida validada sem rolagem vertical em 1280×720, 1366×768 e 1920×1080 com o novo painel de estratégia.
- V1.3.1: design system ampliado, visão geral com hero fotográfico, pilotos/carros em layout comparativo, desenvolvimento em tabela e preparação de GP reorganizada.
- V1.3.1: fotos reais de Albert Park, Shanghai e Suzuka via Wikimedia Commons, com créditos no manifest e fallback local; verificação de mídia atualizada para JPEGs.
- V1.3.1: validação visual em 1280×720, 1366×768 e 1920×1080; sem overflow horizontal e sem rolagem de página em corrida/classificação.
- V1.3.2: containers sem largura central restritiva, fotos de circuito substituídas por imagens mais impactantes, bandeiras locais de 18 países e ícones de clima.
- V1.3.2: torre, estados, linha de corte, eventos e cards de corrida/classificação com mais contraste e hierarquia; corrida em 720p usa alternância compacta entre estratégia e telemetria sem rolar a página.
- V1.3.3: bandeiras duplicadas removidas dos heroes de visão geral e preparação; topbar passou a exibir apenas o nome do GP e as bandeiras de calendário/fim de temporada usam a mesma mídia local.
- V1.3.3: novo `AdminTrackMap` editorial para visão geral e preparação, usando a geometria do motor com gradiente, brilho, setores, largada quadriculada e pit lane simplificada; o mapa funcional de corrida/classificação permaneceu intacto.
- V1.3.3: auditoria de alinhamento em cards, cabeçalhos, grids, colunas laterais, finanças, desenvolvimento, calendário, campeonato, pilotos, menu e seleção; KPIs preenchem a largura e cards de setup/pilotos mantêm alturas coerentes.
- V1.3.3: mapa administrativo adaptado para empilhar em 1024×768 e 768×1024; sem overflow horizontal nas telas administrativas validadas.
- V1.3.3: `typecheck`, 33 testes, build, `check:media` e `/api/health` 1.3.3 aprovados; corrida e classificação sem rolagem de página em 1280×720, 1366×768 e 1920×1080. Em 1024×768 e 768×1024, corrida/classificação mantêm o layout empilhado responsivo com rolagem vertical.
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
6. Ver `README.md`, `docs/MULTIPLAYER.md`, `docs/CLASSIFICACAO.md`, `docs/ESTRATEGIA.md`, `docs/MEDIA.md`, `docs/CONSOLIDACAO_DIRETORIOS.md` e `docs/REGULAMENTO_E_BALANCEAMENTO.md`.
7. Rodar `npm run check:media` se a pasta `public/local-media` for restaurada ou alterada.

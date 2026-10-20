# Checkpoint de desenvolvimento — V1.3.6C

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
- V1.3.4: ultrapassagens com `targetDriverId`, detecção após atualização de distâncias, evento oficial coerente, janela de ataque realista, bateria sustentável, defesa/atributos, dificuldade do circuito e checagem de faixa em contatos.
- V1.3.4: animação dos marcadores por interpolação de distância com `poseAt`, snap em saltos grandes/correções para trás, limite de faixa e remoção da transição CSS em XY.
- V1.3.4: treino livre por equipe/piloto, programas dependentes de carro/piloto/acerto, janela de downforce sem valor exato, ajuste final antes da classificação, confirmação do host e bloqueio de setup nas fases competitivas.
- V1.3.4: planejador usa fator de degradação medido no treino; dados de pneus/combustível/pit aparecem na análise.
- V1.3.4: notificações contextuais com prioridade, cooldown, deduplicação, dispensa e limite de duas; solo configurável (notificar, 1x ou pausar em crítico) e multiplayer host-only.
- V1.3.4: correções de combustível, Safety Car, undercut, cooldown de bateria e tipo inválido de evento.
- V1.3.4: `typecheck`, 54 testes (33 existentes + 21 focados), build, `check:media` e `/api/health` 1.3.4 aprovados; versão `1.3.4` no cliente, servidor e documentação.
- V1.3.5: Overtake Mode por proximidade e bateria, defesa ativa, ataques sustentados, IA que ataca e defende em disputa direta, gestão de energia e cancelamento de ataques sob SC/VSC.
- V1.3.5: eventos oficiais passam a carregar `passedDriverId` e `attackSuccess`; ultrapassagens sob bandeira amarela não são registradas.
- V1.3.5: calibração com 10 seeds de calibração e 5 seeds fora da amostra; médias de 55,3/72,2/66,4 eventos oficiais por GP em Melbourne/Xangai/Suzuka, contra 20,6/29,8/33,8 na V1.3.4.
- V1.3.5: `typecheck`, 55 testes, build, `check:media` e `/api/health` 1.3.5 aprovados; versão `1.3.5` no cliente, servidor e documentação.
- V1.3.6A: cronometragem com interpolação do cruzamento da linha e dos três setores dentro do tick de 0,25 s; `lastLap`, `bestLap`, `lapTimes`, `fastestLap`, `finishTime` e setores passam a usar milissegundos, sem reduzir o passo do motor nem inventar precisão física.
- V1.3.6A: largada individual determinística por piloto, com reação às luzes, tração, qualidade, influência de experiência/consistência/agressividade e RNG separado (`seed:launch:piloto`); largadas ruins e excelentes eventuais, sem vantagem fixa para jogador, equipe ou piloto.
- V1.3.6A: proteção de ordem aplicada depois de todos os carros atualizarem; sem saltos em cadeia, sem inversões por leitura defasada e com no máximo uma posição por tick para o atacante. Primeira volta caiu de 87,3/87,7/88,2% para 35,0/27,4/25,9% de carros mudando de posição (Melbourne/Xangai/Suzuka, 10 seeds), mantendo disputas reais.
- V1.3.6A: todas as ultrapassagens oficiais passaram a ser disputas reais (`attackSuccess`), com taxa de sucesso de 58–69% e zero passes sob SC/VSC; o limiar antigo de 0,5 m deixou de descartar passes legítimos no limite do tick.
- V1.3.6A: limites de pista geram advertência nas duas primeiras ocorrências e +5 s a cada terceira; contato e manobra perigosa permanecem distintos, com motivo no evento e na telemetria. Penalidades totais caíram de ~15–18 para ~3–4 por corrida.
- V1.3.6A: instrumentação de testes em `tests/raceMetrics.ts` (voltas, setores, largadas, primeira volta, passes genuínos, advertências, penalidades e inconsistências) e 12 testes focados em `tests/raceV136.test.ts`.
- V1.3.6A: auditoria com 10 seeds de calibração e 6 seeds fora da amostra em Melbourne/Xangai/Suzuka; holdout confirmou primeira volta em 18,9–31,1% e 100% de passes por ataque.
- V1.3.6A: `typecheck`, 67 testes, build, `check:media` e `/api/health` 1.3.6A aprovados; versão `1.3.6-a` no `package.json` (semver) e identificação `V1.3.6A` no servidor e documentação.
- V1.3.6A: fases B e C da V1.3.6 não foram implementadas nesta entrega.
- V1.3.6B: ritmo por volta determinístico por piloto (`seed:lappace:piloto:volta`), com amplitude dependente de consistência, erros ocasionais e experiência; a gestão de pneus preserva o ritmo do stint e o ruído nunca é aplicado por tick.
- V1.3.6B: máquina de disputa com aproximação, preparação, tentativa, lado a lado, defesa e contra-ataque. O defensor decide aceitar o risco conforme defesa, experiência, agressividade, pneus, dano e posição.
- V1.3.6B: passes legítimos por ritmo, pneus ou erro do rival podem ocorrer sem tentativa anterior marcada, desde que o carro estivesse atrás no início do tick, cruzasse o rival direto e tivesse vantagem real. A proteção contra salto de dois carros e inversão sem vantagem permanece.
- V1.3.6B: auditoria de calibração (10 seeds): 35,8/39,4/27,5 passes por corrida em Melbourne/Xangai/Suzuka, com 21,4/22,4/16,4 passes por ritmo, 8,1/6,4/5,6 por pneus, 4,0/5,6/2,7 por erro e 2,3/5,0/2,8 por ataque. Ataques comprometidos: 9,4/12,4/8,8 por corrida.
- V1.3.6B: a primeira volta manteve 7,5/10,8/6,5 passes por corrida e 7,3/8,7/5,0% de mudança líquida de posição; defesa, lado a lado e contra-ataque ficaram ativos (20,6/42,0/22,7 defesas, 117,6/178,3/129,1 ticks lado a lado e 0,3/0,8/0,4 contra-ataques por corrida).
- V1.3.6B: diferença entre companheiros em 12,2/9,5/14,3% das voltas abaixo de 1 s; delta mediano de corrida 0,756/0,771/0,956 s. A IA usa atributos por piloto e janelas de parada por gestão de pneus, sem ordens de equipe.
- V1.3.6B: variabilidade de ritmo por volta com desvio mediano de 0,0023–0,0024; holdout (6 seeds) confirmou 27,2–32,2 passes por corrida, 4,5–11,4% de mudança líquida na primeira volta e 6,2–9,5 passes na primeira volta.
- V1.3.6B: `typecheck`, 76 testes, build, `check:media` e `/api/health` 1.3.6B aprovados; versão `1.3.6-b` no `package.json` (semver) e identificação `V1.3.6B` no servidor e documentação.
- V1.3.6B: a fase C de bandeiras e incidentes não foi implementada nesta entrega.
- V1.3.6C: amarelas locais por setor, com causa, duração, redução de ritmo, proibição de ultrapassagens na zona e liberação; a pista não é neutralizada por inteiro.
- V1.3.6C: Safety Car com agrupamento progressivo e ritmo do líder controlado; VSC com redução de ritmo e preservação aproximada de intervalos; ambos bloqueiam passes e usam relargada com ordem preservada.
- V1.3.6C: bandeira vermelha congela o relógio esportivo, os carros e a ordem; a retomada é simplificada (sem intervenção nos carros/pneus), com relargada curta e proibição de passes.
- V1.3.6C: bandeira azul identifica retardatários sob pressão de um carro com mais voltas, reduz o ritmo e facilita a passagem sem teleporte; passes sobre retardatários não são contabilizados como ganho de posição.
- V1.3.6C: incidentes graduais de saída de pista, barreira, contato, pneu furado e falha mecânica; dano reduz ritmo, pode ser reparado nos boxes com tempo extra ou evoluir para abandono. Frequência de incidentes permaneceu no patamar da V1.3.6B.
- V1.3.6C: interface existente mostra setores amarelos, SC/VSC, bandeira vermelha, relargada, bandeira azul e dano; alertas de solo/multiplayer preservam as preferências e o controle do host.
- V1.3.6C: calibração (10 seeds): 29,6/31,5/36,6 passes por corrida em Melbourne/Xangai/Suzuka (medianas 31,5/32/36,5; p90 47/41/51), contra 35,8/39,4/27,5 na V1.3.6B. Primeira volta: 8,6/12,3/4,5% de mudança líquida.
- V1.3.6C: por corrida, amarelas locais 4,6/6,5/5,5; SC 0,5/0,9/0,7; VSC 0,2/0,2/0; bandeira vermelha 0/0/0,1; passes sob amarela/SC/VSC 0. Abandonos 0,8/1,1/1,3; reparos 4,3/5,0/4,8; carros danificados 2,2/3,9/2,8.
- V1.3.6C: holdout (6 seeds): 31,3/26,7/30,2 passes em média (medianas 21/23,5/28,5; um evento atípico de 80 passes em corrida com 3 abandonos e 2 Safety Cars), 5,3–6,3 amarelas, 0,3–1,2 SC, 0–0,3 VSC e 0–0,2 vermelha por corrida; nenhum passe sob bandeira.
- V1.3.6C: `typecheck`, 85 testes, build, `check:media` e `/api/health` 1.3.6C aprovados; versão `1.3.6-c` no `package.json` (semver) e identificação `V1.3.6C` no servidor e documentação.
- V1.3.6C: simplificações documentadas: bandeira vermelha sem intervenção/troca de pneus e com relargada parada a partir das posições; amarela local proíbe qualquer passe na zona, sem exceções para carro parado; bandeiras azuis dependem de retardatários efetivos.
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

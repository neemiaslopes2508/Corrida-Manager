# Corrida Manager - V1.3.6B (Fórmula 1 2026)

Manager de Fórmula 1 jogável em português brasileiro. Inclui carreira solo de três etapas (Austrália, China com Sprint e Japão), classificação interativa Q1/Q2/Q3, planejamento de stints, corrida simulada em tempo real sobre traçados reais, gestão financeira/técnica e multiplayer autoritativo para até três jogadores humanos.

A V1.3.4 adicionou disputas de ultrapassagem com alvo rastreado e eventos oficiais, marcadores interpolados ao longo do traçado, treino livre por piloto com ajuste final antes da classificação e notificações contextuais do engenheiro com prioridade e cooldown. A V1.3.5 calibra a frequência e a persistência das disputas da IA com Overtake Mode, defesa ativa, gestão de bateria e ataques sustentados, sem DRS tradicional e sem quantidades fixas de ultrapassagens. No modo solo, o jogador pode escolher notificar, reduzir para 1x ou pausar em eventos críticos; no multiplayer, pausa e velocidade continuam exclusivas do host.

A V1.3.6A corrige a base de tempo da corrida: o cruzamento da linha e dos setores é interpolado dentro do tick de 0,25 s, sem reduzir o passo do motor, e os tempos passam a ser exibidos em milissegundos. A largada ganha reação, tração e qualidade individuais por piloto, determinísticas e derivadas de atributos, com largadas ruins/excelentes e efeito real na primeira volta. A ordem em pista é protegida após todos os carros atualizarem, impedindo saltos em cadeia e passes fantasmas, mas mantendo ataques e defesas reais. Limites de pista passam a gerar advertência e só viram tempo na reincidência; contato e manobra perigosa continuam distintos.

A V1.3.6B aprofunda o desempenho individual e a IA. Cada piloto passa a ter ritmo por volta determinístico, com amplitude dependente de consistência e experiência, erros ocasionais e preservação de stint ligada à gestão de pneus. As disputas ganham estados de aproximação, preparação, tentativa, lado a lado, defesa e contra-ataque. Passes legítimos por velocidade relativa, pneus ou erro do rival podem acontecer sem uma tentativa anteriormente marcada; a proteção contra inversões fantasmas, saltos de dois carros e passes sob SC/VSC é preservada. A IA decide atacar, defender, recarregar energia e poupar pneus com os atributos de cada piloto, sem ordens de equipe e sem quotas fixas. A entrega é a fase B da V1.3.6; a fase C de bandeiras e incidentes permanece pendente.

## Requisitos

- Node.js 20 ou superior (testado com Node 24)
- Navegador moderno com WebSocket
- Windows, Linux ou macOS

## Instalação e execução

```bash
# na pasta do projeto
npm install

# desenvolvimento (servidor 8787 + Vite 5173)
npm run dev

# produção local
npm run build
npm start
```

Em desenvolvimento, abra `http://localhost:5173`. Em produção/host, abra `http://localhost:8787`.

> **Diretório oficial:** `C:\Projetos\CorridaManager`. Abra o terminal e o OpenCode nessa pasta. Artefatos de navegador/Playwright são gravados em `.playwright-mcp/` relativo ao diretório da sessão; veja `docs/CONSOLIDACAO_DIRETORIOS.md`.

Para jogar com amigos pela internet, use o atalho:

```powershell
npm run online
```

O terminal exibirá um link público HTTPS/WSS para compartilhar.

## Iniciadores Windows

Na raiz do projeto há dois atalhos para duplo clique, independentes do diretório atual:

| Arquivo | O que faz |
| --- | --- |
| `Corrida Manager - Local.bat` | Verifica Node.js/dependências, evita servidor duplicado, compila, inicia o servidor em `http://localhost:8787` e abre o navegador. |
| `Corrida Manager - Online.bat` | Verifica Node.js/dependências e a porta 8787, inicia o servidor + Cloudflare Quick Tunnel, exibe o link público e abre o jogo no navegador do host. |

Mantenha a janela aberta durante o jogo. `Ctrl+C` ou fechar a janela encerra o servidor (e o túnel, no modo online). Se já existir um servidor local na porta 8787, o iniciador local apenas abre o navegador; o iniciador online se recusa a iniciar para não criar um túnel concorrente.

Scripts:

| Script | Função |
| --- | --- |
| `npm run dev` | sobe servidor autoritativo e cliente Vite juntos |
| `npm run dev:web` | apenas cliente Vite |
| `npm run dev:server` | apenas servidor Node/WS com reload |
| `npm run build` | checagem TypeScript + build do cliente em `dist/` |
| `npm start` | serve o build e o WebSocket na porta 8787 |
| `npm run host` | build + start (recomendado para jogar em LAN) |
| `npm run online` | build + host + Cloudflare Quick Tunnel com link público HTTPS/WSS |
| `npm test` | testes do motor, carreira, mídia e multiplayer |
| `npm run check:media` | valida os 22 retratos, 11 logos e o manifest local |
| `npm run typecheck` | checagem de tipos |

Variáveis opcionais do servidor:

- `PORT` (padrão `8787`)
- `HOST` (padrão `0.0.0.0`)
- `CM_DATA_DIR` (padrão `data/rooms`) — pasta de salvamento das salas
- `CM_RACE_LAPS` — apenas para testes automatizados; reduz a distância simulada

## Carreira solo

1. Menu → **Nova carreira solo** → escolha uma das 11 equipes.
2. No dashboard, gerencie pilotos, carro, desenvolvimento, finanças, patrocínios, calendário e campeonato.
3. **Preparar GP** → ajuste downforce, foco, composto inicial e pit planejado.
4. **Treino livre** → rode até três programas. Eles revelam a janela de acerto e dados de pneus.
5. **Classificação interativa** → Q1/Q2/Q3 em tempo real, com relógio, múltiplas tentativas, pneus, combustível, tráfego, evolução da pista, mapa e torre de tempos. Na China há Sprint Qualifying (SQ1/SQ2/SQ3), Sprint e depois a classificação principal. O host avança os segmentos. Antes da corrida, cada piloto recebe um plano de stints com compostos, janelas de parada, previsão de desgaste e tempo projetado. Durante a prova, o engenheiro recomenda decisões e a interface mostra vida do pneu, previsão de chuva, undercut/overcut e estoque de pneus. Veja `docs/ESTRATEGIA.md`.
6. **Corrida** → acompanhe em tempo real, controle os dois carros e ajuste ritmo, energia, pneus e pits. Use 1x–50x, pause ou **Simular fim**.
7. **Resultados** → pontos, premiação, patrocínio, salários, campeonato e próxima etapa.
8. Após o Japão, a temporada encerra com campeões de pilotos e construtores.

O progresso solo é salvo automaticamente no `localStorage` do navegador. Checkpoints da classificação e da corrida em andamento também são salvos; ao carregar a carreira, a sessão é retomada. Use **Salvar** para gravar manualmente. Detalhes em `docs/CLASSIFICACAO.md`.

## Multiplayer — 3 jogadores

### Online pela internet (link público)

```powershell
cd C:\Projetos\CorridaManager
npm run online
```

O script:

1. compila o cliente;
2. inicia o servidor autoritativo na porta 8787;
3. baixa o `cloudflared` oficial uma única vez para `tools/` (se necessário);
4. cria um **Cloudflare Quick Tunnel**;
5. mostra um link `https://....trycloudflare.com`;
6. valida HTTP público e WebSocket WSS (`ping/pong`);
7. mantém servidor e túnel ativos até `Ctrl+C`.

Compartilhe **o link e o código da sala** com os jogadores. Eles abrem o link público, entram com nome + código, escolhem equipes diferentes, marcam **Pronto** e o host inicia. O cliente detecta automaticamente HTTPS/WSS pela própria URL aberta; não há `localhost` nem IP privado embutido.

O Quick Tunnel é temporário: o link muda quando o host é reiniciado. Mantenha o terminal aberto durante a partida. Não é necessário domínio, conta Cloudflare ou hospedagem paga. Na primeira abertura, o DNS do link pode levar 1–2 minutos para propagar.

### LAN

1. O host roda `npm install`, `npm run build` e `npm start` (ou `npm run host`).
2. O terminal mostra o endereço local e o endereço LAN, por exemplo `http://192.168.0.10:8787`.
3. Cada jogador abre o endereço no navegador → **Multiplayer**.
4. O host cria a sala e compartilha o código de 5 caracteres. Os outros entram com nome + código.
5. Cada jogador escolhe uma equipe diferente e clica em **Marcar pronto**.
6. O host clica em **Iniciar carreira**.
7. O servidor é autoritativo: simulação, tempo, regras, classificação, corrida e resultados ficam no host. Só o host avança segmentos de classificação, pausa e altera a velocidade.
8. Cada cliente recebe apenas os próprios carros nos painéis de estratégia e classificação. Comandos de outros carros são rejeitados pelo servidor.
9. Se um cliente cair, o token de reconexão fica salvo no navegador. Volte à mesma sala e use **Reconectar**.
10. Salas e carreiras são persistidas em `data/rooms/*.json`. Se o servidor reiniciar, a sala é recarregada pausada; reconecte e retome.

### Acesso fora da rede local sem o script

Não presuma que a porta 8787 está acessível pela internet. Opções sem infraestrutura paga:

- **Cloudflare Quick Tunnel**: `cloudflared tunnel --url http://localhost:8787` e compartilhe a URL gerada. O script `npm run online` automatiza isso.
- **Tailscale**: instale na máquina host e nos clientes, use o IP Tailscale do host com a porta 8787.

### Segurança e origens

- O handshake WebSocket valida `Origin` contra o `Host` da requisição, `PUBLIC_URL` ou `ALLOWED_ORIGINS`.
- Tokens de sessão de 144 bits protegem reconexão; cada jogador só recebe o próprio token.
- Comandos de corrida, setup e gestão são validados no servidor por equipe e por papel (host).
- Limite de payload, limite de mensagens por segundo, timeouts e heartbeat detectam conexões mortas atrás do túnel.
- `CM_ALLOW_ANY_ORIGIN=1` é usado apenas no script de desenvolvimento local; em produção não é definido.
- `CM_ALLOW_NO_ORIGIN=1` existe apenas para ferramentas/testes não-browser; não use em produção.
- A listagem pública de salas fica desativada por padrão (`CM_EXPOSE_ROOMS=1` habilita em LAN).

Detalhes de configuração e validação em `docs/MULTIPLAYER.md`.


WebSocket usa o mesmo host/porta da página (`/ws`), portanto túneis HTTP/HTTPS que suportem upgrade de WebSocket funcionam.

## Dados e assets

- Identidade de equipes, pilotos, números, países e cores: manifests públicos de 2026 em `C:\Projetos\FM26-Assets`.
- Geometria dos circuitos de Melbourne, Xangai e Suzuka: GeoJSON comunitário `bacinger/f1-circuits` (MIT), normalizado para 600×360. Licença copiada em `src/data/tracks/LICENSE-f1-circuits.txt`.
- Retratos dos 22 pilotos e logos das 11 equipes: cópia privada de `C:\Projetos\FM26\apps\web\public\local-media`, em `public/local-media/`. O diretório é ignorado pelo Git e não deve ser redistribuído.
- Atributos de pilotos, desempenho dos carros, orçamentos, salários e patrocinadores são **estimativas de balanceamento**, não dados oficiais.
- ComfyUI não foi necessário: o visual funcional usa SVG/CSS e não bloqueia a jogabilidade.

### Mídia local privada

Os retratos e logos são carregados por IDs estáveis (`driver_*` e `team_*`), com fallback textual se o arquivo faltar. O host serve os arquivos aos navegadores conectados; o servidor não lista diretórios.

```powershell
npm run check:media
```

O manifest original registra que não há licença de redistribuição identificada e que o uso autorizado é privado/local. Não publique `public/local-media/`, `dist/local-media/` nem um build contendo essas imagens. Direitos, aplicação por tela e limitações em `docs/MEDIA.md`.

As fotos dos circuitos de Melbourne, Xangai e Suzuka são locais, vêm do Wikimedia Commons e têm autor/licença registrados em `docs/MEDIA.md` e no manifest. A V1.3.2 também usa bandeiras locais (Flagcdn) e ícones vetoriais de clima. Detalhes também em `docs/ASSETS.md` e `docs/REGULAMENTO_E_BALANCEAMENTO.md`.

## Estrutura

```
src/
  data/            temporada 2026, circuitos, staff, geometria
  engine/          motor puro compartilhado por solo e servidor
    race.ts        simulação por passos de 250 ms
    career.ts      carreira, finanças, desenvolvimento, calendário
    qualifying.ts  Q1/Q2/Q3 e Sprint Qualifying
    actions.ts     despacho de ações de carreira
  net/             protocolo WS e cliente
  media/           resolução da mídia local por IDs estáveis
  ui/              telas React (Media.tsx: retratos, logos e fallback)
  App.tsx          fluxo e estado de sessão
public/
  local-media/     retratos/logos privados (ignorado pelo Git)
server/
  index.ts         HTTP + WebSocket autoritativo + loop de corrida
  storage.ts       persistência JSON das salas
tests/
  engine.test.ts
  multiplayer.test.ts
```

## Simplificações declaradas

- Um único passo de 250 ms para física, pneus, combustível e energia. Não há modelo de suspensão ou telemetria por roda.
- Q1/Q2/Q3 usam uma volta simulada por piloto; não há tráfego nem tentativas múltiplas.
- Safety Car e VSC usam duração e limites de velocidade aproximados; não há procedimento de pelotão por setores.
- O Overtake Mode 2026 é abstraído como boost elétrico com detecção a ~1 s e consumo de bateria; não há DRS.
- A aerodinâmica ativa é representada por um ganho em retas, não por asas móveis modeladas.
- Regra de dois compostos secos é aplicada com penalidade de 30 s; corridas declaradas molhadas dispensam a regra.
- Pit lane usa uma linha deslocada e perda de tempo por velocidade limitada + serviço; não há boxes individuais.
- Penalidades são de tempo (+5 s / +30 s) e não há penalidade de grid por troca de componentes nem pit speeding.
- Contratos vencem após duas etapas; sem renovação, há renovação automática com salário maior.
- Multiplayer não tem anti-cheat criptográfico; o servidor valida comandos e propriedade das equipes, mas os clientes recebem o estado da carreira.

## Testes

```bash
npm test
```

Cobrem:

- integridade de traçados e tempos de referência;
- grid de 22 pilotos e segmentos 22 → 16 → 10;
- classificação interativa com múltiplas tentativas, pneus, combustível, tráfego, chuva, evolução da pista e IA;
- planejamento de stints, projeções de desgaste, pit loss, undercut/overcut, recomendações do engenheiro e estoque de pneus;
- IA estratégica com planos, reação a neutralizações e diferenciação por estrategista;
- Safety Car/VSC com duração por voltas, ritmo progressivo e pit stops durante neutralização;
- posições únicas, classificação e pontuação;
- pit stops, troca de compostos e regra de dois compostos;
- efeito quantitativo de ritmo/gestão de pneus;
- determinismo e serialização do estado de corrida;
- carreira completa de três etapas com Sprint, finanças, desenvolvimento e campeões;
- salvamento/carregamento em JSON;
- associação dos 22 pilotos e 11 equipes à mídia local, aliases e fallback;
- integração multiplayer real com três clientes WebSocket, reconexão, comandos autoritativos, sincronização e conclusão da corrida.
- rejeição de handshake com origem desconhecida ou sem `Origin`.

Resultado da última execução: **33 testes aprovados** (5 arquivos).

### Validação pública do multiplayer

Há três níveis distintos, que não devem ser confundidos:

1. **Automatizado local** — `npm test` sobe um servidor local e conecta três clientes WebSocket. Valida criação/entrada, três equipes, prontidão, início, comandos autoritativos, reconexão, pausa, estado idêntico e fim de corrida.
2. **Túnel público** — `npm run online` valida HTTP público e WSS público do link `trycloudflare.com`. Para repetir um teste funcional completo por esse link:

   ```powershell
   npm run check:public -- https://SEU-LINK.trycloudflare.com
   ```

   O script abre três clientes pelo link público, testa rejeição de origem desconhecida, reconexão por token, equipes distintas, estratégia, pausa/estado idêntico e conclusão da corrida. Ele usa o servidor que estiver rodando; para encurtar a prova, inicie o host com `CM_RACE_LAPS=4`.
3. **Usuários reais externos** — exige pessoas em outra rede/cidade abrindo o link, escolhendo equipes e jogando. Um teste de túnel na mesma máquina comprova o caminho público HTTPS/WSS, mas **não** substitui essa validação humana externa.

Nesta máquina, o túnel público foi validado com HTTP, WSS, rejeição de origem desconhecida/sem Origin e três clientes pela URL pública: sala, três equipes, reconexão, comando, pausa/estado idêntico e corrida curta concluída. A validação com pessoas em outra rede/cidade permanece pendente.


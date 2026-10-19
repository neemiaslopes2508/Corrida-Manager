# Classificação interativa — V1.2

## Formato

| Sessão | Segmentos | Duração | Avançam |
| --- | --- | --- | --- |
| Classificação tradicional | Q1 → Q2 → Q3 | 18 / 15 / 12 min | 22 → 16 → 10 |
| Sprint Qualifying | SQ1 → SQ2 → SQ3 | 12 / 10 / 8 min | 22 → 16 → 10 |

Critérios:

- cada piloto pode fazer múltiplas tentativas por segmento;
- somente voltas válidas contam;
- melhor tempo do segmento define a ordem;
- empate é resolvido pelo horário em que o tempo foi marcado;
- Q3 é ordenada apenas por tempos da Q3;
- Q2 é ordenada por tempos da Q2; Q1 por tempos da Q1;
- o grid final é Q3 + eliminados da Q2 + eliminados da Q1.

Em Sprint Qualifying seca, SQ1 e SQ2 usam pneus médios e SQ3 usa macios. Com pista molhada, intermediários e chuva ficam liberados.

## Sessão em tempo real

O módulo `src/engine/qualifyingSession.ts` mantém:

- relógio regressivo e status `running`, `between` ou `finished`;
- carros em `garage`, `out`, `flying`, `in`, `eliminated` ou `finished`;
- volta de saída, voltas lançadas e volta de entrada;
- distância percorrida no traçado, velocidade e setores;
- histórico de tentativas, melhor volta e ordem de marcação;
- pneus com temperatura, desgaste, composto e jogos restantes;
- combustível da tentativa (1 ou 2 voltas lançadas);
- modo de preparação dos pneus: gestão, normal ou push;
- evolução de borracha, chuva, temperatura e umidade da pista;
- tráfego por proximidade entre carros em pista;
- erros simplificados de limites de pista, que invalidam a volta.

A posição visual no mapa vem de `distance`, atualizada a cada passo da simulação. O tempo da volta é o tempo real acumulado entre as linhas de setor e de chegada, não um valor separado da animação.

## Modelo de desempenho

Influenciam o tempo:

- atributos do carro: aerodinâmica, curvas, retas e energia, com pesos ajustados ao circuito;
- atributos do piloto: velocidade, consistência, experiência, chuva e gestão de pneus;
- downforce escolhido em relação ao ideal da pista;
- confiança do acerto obtida no treino livre;
- composto, aderência, temperatura e desgaste;
- combustível transportado;
- borracha acumulada e evolução da pista;
- chuva e temperatura;
- tráfego;
- erros de pilotagem e limites de pista.

O RNG é derivado da seed da carreira, segmento, piloto, tentativa e tipo de volta. A mesma carreira e sequência de comandos produz o mesmo resultado.

## Controles

Para cada piloto da equipe:

- composto;
- combustível: uma ou duas voltas lançadas;
- preparação dos pneus;
- enviar aos boxes/pista;
- abortar tentativa;
- acompanhar pneus, setores, tentativas e jogos restantes.

Enviar aos boxes é o estado padrão. Comandos incompatíveis são rejeitados pelo motor e pelo servidor.

## IA

As equipes controladas pela IA:

- planejam até 2–3 tentativas por segmento;
- escolhem compostos conforme a regra e a chuva;
- reagem à zona de eliminação e ao tempo restante;
- evitam enviar todos os carros ao mesmo tempo;
- aproveitam a evolução da pista;
- interrompem tentativas quando os recursos ou o tempo acabam.

## Multiplayer

- o servidor é a única autoridade da sessão;
- o relógio e as transições são compartilhados;
- comandos são aceitos apenas para os pilotos da equipe do jogador;
- o host controla pausa, velocidade, avanço de segmento e simulação restante;
- o estado completo é persistido na carreira da sala;
- reconexão recebe `career_state` e `qualifying_view`;
- a IA assume equipes que saem da sala.

Mensagens:

- `qualifying_command`: plano, envio ou aborto;
- `qualifying_control`: pausa, velocidade, próximo segmento ou simulação;
- `qualifying_view`: torre, mapa, relógio, eventos e controles.

## Compatibilidade

A V1.2 introduziu `CAREER_VERSION 2` e `qualifyingSession`. A V1.3 eleva a versão para `3`, preservando essa migração e adicionando planos de corrida e estoque de pneus. Saves V1/V1.2 em fase de classificação com resultado antigo continuam exibindo o resultado legado; saves sem resultado criam uma sessão interativa.

## Simplificações conhecidas

- o Pit Lane visual é abstrato: a volta de saída começa na linha de largada;
- não há bandeira vermelha, amarela, investigação ou penalidade de grid;
- a chuva é uma única janela evolutiva por sessão;
- a IA não negocia posição de pista por rádio;
- a classificação usa conjuntos simplificados de pneus, não a alocação oficial completa da Pirelli;
- a Sprint Qualifying seca segue a regra simplificada médio/médio/macio.

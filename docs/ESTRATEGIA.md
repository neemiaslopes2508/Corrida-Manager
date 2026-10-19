# Estratégia avançada de corrida — V1.3

## Objetivo

A V1.3 transforma a estratégia em uma decisão planejada e acompanhada durante a corrida, sem alterar a classificação interativa da V1.2.

## Planejamento antes da largada

Cada piloto possui um `RaceStrategyPlan` com:

- número de stints;
- composto de cada stint;
- duração em voltas;
- janela flexível de pit stop;
- projeção de desgaste, tempo e risco;
- estoque de pneus compartilhado com a classificação.

O plano é armazenado em `CareerRoundState.raceStrategyPlans` e validado pelo servidor. A soma dos stints deve corresponder ao total de voltas. Em corrida seca, o plano precisa usar ao menos dois compostos secos.

## Pneus

`src/engine/raceStrategy.ts` reutiliza `src/engine/tyres.ts` para:

- projetar desgaste volta a volta;
- estimar a vida útil até 85% de desgaste;
- considerar temperatura, chuva, abrasividade, estilo e composto;
- calcular o custo de aquecimento dos pneus novos;
- comparar o ritmo de um stint atual com um stint novo.

A alocação é simplificada:

- fim de semana tradicional: 8 macios, 5 médios, 3 duros, 3 intermediários e 2 de chuva;
- fim de semana Sprint: 7 macios, 5 médios, 2 duros, 3 intermediários e 2 de chuva.

O estoque é consumido na classificação e na corrida. Saves antigos recebem a alocação automaticamente.

## Pit stops

A projeção de perda de pit usa a mesma geometria do pit lane do motor e o rating da equipe de pit stop. O valor exibido na preparação, no treino e na corrida é uma estimativa do tempo físico real; não é adicionado novamente ao pit stop simulado.

O rating de pit stop é separado do rating do estrategista:

- `TeamState.pitCrew` representa a execução do pit stop;
- `staff.estrategista.rating` representa a qualidade das decisões da IA.

Saves antigos derivam `pitCrew` da reputação e da confiabilidade do carro.

## Undercut e overcut

As funções `projectPitGain()`, `projectUndercut()` e `projectOvercut()` comparam:

- tempo perdido no pit;
- ritmo atual;
- ritmo esperado com pneus novos;
- aquecimento dos pneus;
- tráfego estimado.

As projeções são determinísticas e não alteram posições. A posição final continua emergindo da simulação física, da distância percorrida e do tempo de pit.

## Engenheiro de corrida

O engenheiro gera recomendações contextuais a partir do estado real:

- pneus no limite;
- necessidade de antecipar ou prolongar o stint;
- chuva prevista;
- Safety Car como janela de pit;
- risco de undercut;
- combustível ou bateria baixos.

As mensagens têm cooldown por chave e por voltas para evitar repetição. Para equipes humanas, o engenheiro não executa comandos automaticamente.

## IA

A IA rival:

- recebe um plano antes da largada;
- escolhe compostos conforme o plano e o estoque;
- reage a desgaste, clima, Safety Car, undercut e cobertura de rivais;
- usa o rating do estrategista para modular a agressividade e a qualidade das decisões;
- não usa informações ocultas além da previsão de clima disponível ao jogador.

## Safety Car e VSC

- A duração é definida em voltas de referência e também em tempo simulado.
- O pelotão reduz progressivamente a velocidade; não há teletransporte.
- A ordem é preservada pela distância percorrida.
- Pit stops durante neutralização usam a perda relativa menor.
- O retorno à pista verde ocorre por tempo ou por volta-alvo.
- O texto da interface descreve o comportamento como ritmo controlado, não como agrupamento físico perfeito.

## Multiplayer

- Planos de corrida são validados no servidor.
- Comandos de alteração carregam revisão para evitar duplicação.
- A visão de corrida expõe o plano completo, o estoque e as recomendações apenas para a equipe do jogador.
- Planos de equipes humanas adversárias são removidos do `career_state` enviado a outros jogadores.
- IA e demais equipes continuam visíveis apenas por informações públicas (posição, pneu, paradas e intervalo).

## Compatibilidade

`CAREER_VERSION` foi elevada para `3`. `migrateCareer()` adiciona:

- `pitCrew` às equipes antigas;
- `raceStrategyPlans` e `tyreInventory` às rodadas antigas;
- planos padrão compatíveis com o total de voltas.

Estados de corrida antigos são normalizados por `ensureRaceState()` antes de avançar ou montar a visão.

## Limitações mantidas

- O pit lane é representado pela geometria e pelas frações de entrada/saída existentes; não há animação detalhada de macacos e mecânicos.
- A perda de pit é uma estimativa física simplificada, não telemetria oficial.
- A chuva continua em fases determinísticas por volta.
- Safety Car e VSC são abstrações simplificadas, sem procedimento completo de relargada ou investigação.
- A alocação de pneus é simplificada e documentada, não a alocação oficial completa da Pirelli.
- O combustível não é reabastecido; a margem mínima é 92% e pode exigir economia.

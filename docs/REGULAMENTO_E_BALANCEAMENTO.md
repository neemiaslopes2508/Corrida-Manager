# Regulamento 2026 e balanceamento

## Pontuação

- Corrida: 25-18-15-12-10-8-6-4-2-1 (top 10).
- Sprint: 8-7-6-5-4-3-2-1 (top 8).
- Não há ponto de volta mais rápida (regra removida nas temporadas recentes; a V1 não o pontua).
- Critério de desempate: pontos, vitórias, pódios, melhor resultado.

## Fim de semana

- Austrália e Japão: treino livre → Q1/Q2/Q3 → corrida.
- China: treino livre → Classificação Sprint → Sprint → Classificação → corrida.
- Sprint Qualifying usa o mesmo modelo Q1/Q2/Q3, com 19 voltas de Sprint.
- Sprint não exige troca de compostos.

## Pneus

- Compostos: macio, médio, duro, intermediário e chuva.
- Corrida seca exige ao menos dois compostos secos diferentes; quem não cumprir recebe +30 s.
- Um pit stop troca o composto escolhido em `Próximo pneu`.
- Desgaste, temperatura, abrasividade, ritmo, estilo de gestão e habilidade do piloto alteram o desempenho.
- A temperatura busca um equilíbrio; acima da janela ideal há perda de grip e mais desgaste.

## Pit stops

- Entrada em ~95,5% da volta; serviço em ~98,5%; saída em ~2,2% da volta seguinte.
- Velocidade do pit lane: 15 m/s (54 km/h).
- O tempo de serviço depende do estrategista da equipe.
- O comando pode ser agendado, imediato ou cancelado antes da entrada. Depois de entrar, não pode ser cancelado.

## Energia e ultrapassagem

- Bateria 0–100; modos poupar/normal/empurrar alteram consumo, colheita e velocidade.
- O Overtake Mode é abstraído: um carro a menos de ~1 s pode receber boost elétrico adicional, com consumo de bateria.
- A aerodinâmica ativa é abstraída como ganho de eficiência em retas. **DRS não é usado.**
- A ultrapassagem depende de vantagem de ritmo, pneus, habilidade de ultrapassagem/defesa, dificuldade da pista, reta e estado da corrida. A posição muda porque a distância percorrida cruza a do rival, não por teleporte.

## Safety Car, VSC e penalidades

- Acidentes podem gerar Safety Car (pelotão agrupado, sem ultrapassagens) ou VSC (delta de velocidade).
- Safety Car dura cerca de 3 voltas simuladas; VSC cerca de 1,4 volta.
- Limites de pista e manobras perigosas geram +5 s. Contato gera +5 s e dano.
- A regra dos dois compostos gera +30 s ao final, se aplicável.
- Falhas mecânicas e acidentes retiram o carro da corrida.

## Balanceamento (estimativas do jogo)

Nenhum atributo abaixo é dado oficial de desempenho. São valores de projeto para produzir uma grelha plausível.

Ritmo base:

```
carIndex    = aero*0.25 + curvas*0.30 + retas*0.25 + energia*0.20
driverIndex = velocidade*0.52 + consistência*0.18 + experiência*0.12
              + ultrapassagem*0.10 + gestãoPneus*0.08

fator = 1 + (carIndex - 81)*0.00058 + (driverIndex - 81)*0.00048
```

- Curvas/retas recebem bônus específicos do setor.
- Forma individual tem variação de ~±0,12%, maior para pilotos menos consistentes.
- Downforce fora da janela ideal custa até ~0,4% por unidade de erro.
- Massa de combustível melhora ~0,4% ao longo da corrida.
- Grip do pneu varia de acordo com composto, desgaste, temperatura e chuva.
- Chuva reduz o grip de pneus secos e valoriza a habilidade de chuva.
- Ar sujo reduz apoio em curvas e aumenta temperatura; aspiração ajuda em retas.

Valores iniciais de referência:

- Volta base: Melbourne 80,5 s; Xangai 94,2 s; Suzuka 91,8 s.
- Pit loss: 21,5 / 22,0 / 22,5 s.
- Combustível: ~1,85–1,95 kg/volta.
- Bateria inicial: 72; colheita passiva + frenagem; modo normal próximo do equilíbrio.
- Chance de chuva: 28% / 22% / 32%, com frentes de chuva por volta.

## Determinismo

- Seed textual + PRNG `mulberry32` com estado serializável.
- O mesmo seed, grid, clima, comandos e passos produz o mesmo resultado.
- O estado completo da corrida é serializável em JSON (carros, RNG, eventos, clima).
- O servidor multiplica o tempo real pela velocidade escolhida pelo host, mas mantém passos fixos de 250 ms.

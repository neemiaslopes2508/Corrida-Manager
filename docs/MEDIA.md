# Mídia local 2026 (retratos e logos)

## Origem

Os arquivos foram copiados de:

```text
C:\Projetos\FM26\apps\web\public\local-media\
```

para:

```text
public/local-media/
```

O projeto FM26 não foi alterado. Os retratos e logos vieram do FM26; as três fotos de circuito da V1.3.1 vieram do Wikimedia Commons e foram registradas no manifest. O ComfyUI não foi usado.

## Conteúdo importado

| Recurso | Quantidade | Formato | Dimensão |
| --- | ---: | --- | --- |
| Retratos de pilotos | 22 | PNG | 1000 × 1000, quadrados |
| Logos de equipes | 11 | SVG | viewBox 96 × 96, fundo transparente |
| Fotos de circuito | 3 | JPEG | recorte 1280 × 720 |
| Bandeiras de países | 18 | PNG | 80 px de largura |
| Manifest de origem | 1 | JSON | origem, licença e autorização de uso privado |

Total aproximado: 6,9 MB.

O `manifest.json` foi mantido junto dos arquivos porque registra a origem, o titular dos direitos e a autorização de uso privado local. Ele não é usado como chave em tempo de execução; a associação do jogo é feita por IDs estáveis.

## Associação por IDs estáveis

- Pilotos: `driver_lando_norris`, `driver_oscar_piastri`, ..., `driver_sergio_p_rez`.
- Equipes: `team_mclaren`, `team_mercedes`, ..., `team_haas`.

O caminho é resolvido por:

```text
public/local-media/drivers/<driverId>.png
public/local-media/teams/<teamId>.svg
public/local-media/circuits/<circuitKey>.jpg
```

O código fica em `src/media/season2026.ts`. Nomes exibidos, apelidos e posições no grid não são usados como chave. O módulo também mantém os aliases do FM26 (`driver_alex_albon` e `driver_sergio_perez`) para compatibilidade futura.

## Componentes e fallback

`src/ui/Media.tsx` expõe:

- `DriverPortrait`: retrato quadrado com `object-fit: cover`, proporção preservada e tamanhos `xs` a `hero`.
- `TeamLogo`: logo com `object-fit: contain`, placa clara para manter visíveis logos escuros e claros.
- `CircuitPhoto`: foto de circuito com `object-fit: cover`, crédito opcional e fallback textual.

Se o arquivo estiver ausente ou falhar ao carregar, o componente mostra um fallback textual: código do piloto com fundo escuro ou sigla da equipe em uma placa clara. O fallback não dispara requisições externas.

## Onde as imagens aparecem

- Seleção de equipe: logos dos cards, logo grande do detalhe e retratos dos dois pilotos.
- Lobby multiplayer: logos e duplas de pilotos na escolha de equipe e nos jogadores.
- Dashboard: identidade da equipe, retratos nos cards de piloto, classificação e construtores.
- Campeonato e classificação: retratos compactos dos pilotos e logos compactos das equipes.
- Treino/classificação: retratos e logos na tabela e no grid.
- Corrida: retrato do piloto selecionado na telemetria e retrato nos dois cards de estratégia. Tamanhos pequenos para preservar o layout full-screen sem rolagem no desktop.
- Resultados e fim de temporada: retratos, logos e identidade dos campeões.

## Fotos de circuito da V1.3.1

As imagens foram obtidas no Wikimedia Commons, recortadas para 1280×720 e recomprimidas em JPEG para uso local.

| Circuito | Arquivo | Autor | Licença | Origem |
| --- | --- | --- | --- | --- |
| Albert Park | `circuits/melbourne.jpg` | Planet Labs, Inc. | CC BY-SA 4.0 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Melbourne_Grand_Prix_Circuit,_December_24,_2017_SkySat_(cropped).jpg) |
| Shanghai | `circuits/shanghai.jpg` | emperornie | CC BY-SA 2.0 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Alonso_china_2013.jpg) |
| Suzuka | `circuits/suzuka.jpg` | Cineyas | CC BY-SA 4.0 | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:RB20_During_the_2024_Japanese_Free_Practice.jpg) |

A atribuição aparece no hero da visão geral e da preparação do GP, e no manifest local. As fotos são usadas apenas como contexto visual; o traçado funcional continua sendo o SVG do motor.

## Bandeiras de países

As bandeiras pequenas da V1.3.2 ficam em `public/local-media/flags/` e foram obtidas em [Flagcdn](https://flagcdn.com/). Os desenhos de bandeiras são de domínio público; o manifesto local registra os países usados. Elas identificam nacionalidades já presentes em `season2026.ts`, sem criar novos dados.

## Direitos e distribuição

Os manifests informam que não há licença de reprodução/redistribuição identificada. A autorização registrada é do responsável pelo projeto FM26, em 2026-10-16, para uso privado local, sem redistribuição.

Por isso:

- `public/local-media/` está no `.gitignore` e não deve ser versionado.
- Os arquivos não são embutidos no código-fonte (sem base64 ou imports de imagem).
- Não publique o diretório, um build com ele, nem um repositório contendo os arquivos.
- Uso privado não equivale a autorização de redistribuição.
- O host serve os arquivos aos participantes da partida; qualquer recurso entregue ao navegador pode ser copiado pelo cliente.
- O servidor não lista diretórios. Os caminhos, porém, são previsíveis a partir dos IDs; não trate a URL como controle de acesso.

O `dist/` também é ignorado pelo Git. Ao gerar um build, o Vite copia `public/local-media` para `dist/local-media`; não compartilhe esse diretório publicamente.

## Validação

```powershell
npm run check:media
npm test
npm run build
```

`npm run check:media` confere:

- 22 retratos, 11 logos e 3 fotos de circuito no manifest;
- correspondência entre os IDs da temporada e os IDs da mídia;
- existência, tamanho e caminho dos arquivos;
- assinatura PNG e dimensões quadradas;
- SVG válido, com `viewBox` e sem referência externa;
- assinatura JPEG das fotos de circuito.

## Limitações

- Os arquivos não acompanham o repositório; uma cópia nova precisa recebê-los manualmente do FM26.
- A licença de redistribuição das imagens oficiais não foi confirmada.
- Os retratos têm fundo sólido da equipe, não transparência; a transparência dos SVGs é preservada.
- Em telas muito baixas, os painéis de classificação e rádio continuam com rolagem interna, sem rolar a página de corrida no desktop.

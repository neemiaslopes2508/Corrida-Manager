# Assets aproveitados do FM26 / FM26-Assets

O projeto FM26 original não foi alterado. A inspeção foi seletiva.

## Copiado

| Recurso | Origem | Uso |
| --- | --- | --- |
| Geometria de Melbourne, Xangai e Suzuka | `FM26-Assets/circuits/geometry/circuit_*.json` | traçados normalizados 600×360, convertidos para `src/data/tracks/geometry.ts` |
| Licença MIT do GeoJSON | `FM26-Assets/sources/LICENSE-f1-circuits.txt` | cópia em `src/data/tracks/` |
| Identidade das 11 equipes | `FM26-Assets/manifests/teams-2026.json` | nome, nome oficial, sigla, país, cores |
| Identidade dos 22 pilotos | `FM26-Assets/manifests/drivers-2026.json` | nome, código, número, país, equipe |
| Calendário 2026 (3 primeiras etapas) | `FM26-Assets/manifests/calendar-2026.json` | Austrália, China (Sprint) e Japão |
| Ideias de RNG determinístico e passos de simulação | `FM26/packages/simulation` | reimplementadas de forma independente |

## Não copiado

- Logos e retratos oficiais: não fazem parte do código-fonte versionado. Há uma cópia privada em `public/local-media/`, fora do Git, para uso local; direitos, escopo e validação estão em `docs/MEDIA.md`.
- SVGs de prévia dos circuitos: a geometria bruta foi usada para gerar um traçado próprio.
- Código do motor FM26: o projeto anterior usa pista sintética e corridas de teste de 5 voltas. O motor desta V1 foi escrito do zero para pista real, 2026, carreira e multiplayer.
- Sistema de salvamento SQLite do FM26: substituído por JSON no servidor e `localStorage` no solo.

## Observações de direitos

A geometria comunitária é MIT; o aviso de licença é mantido. Nomes de equipes, pilotos e marcas pertencem aos respectivos titulares. Esta V1 é um projeto local/educacional e não deve ser publicado comercialmente sem autorização dos detentores.

## ComfyUI

A integração local está disponível, mas não foi usada. O requisito visual era funcional; SVG/CSS cobrem traçado, marcadores, cores e legibilidade. A geração de imagens não é bloqueio de jogabilidade.

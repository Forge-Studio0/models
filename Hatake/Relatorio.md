# Alterações Hatake · 18.11.81

Os mesmos recursos Hatake foram integrados nas duas edições. Na original, 2.990 arquivos do BP e 7.559 do RP mantiveram os mesmos bytes da edição Sarutobi 18.11.80 correspondente. Na cumulativa, 2.990 arquivos do BP e 7.999 do RP foram preservados. O pack do desmaio nativo e os demais membros externos também foram comparados byte a byte.

## Pack de comportamento

- `manifest.json` recebeu a versão 18.11.81. Os UUIDs, módulos e vínculos entre BP e RP continuam compatíveis com a base.
- `scripts/rp_v170_clan_runtime.js` perdeu somente a declaração usada pela aura cosmética Hatake e a emissão central de `nz:chakra`, `nz:raio` ou `nz:amaterasu` nesses três modos de TP.

Os seis itens continuam no slot `slot.armor.head`. As verificações encontraram os seis requisitos originais, as duas categorias de multiplicadores e as três listas de `nz:raio_roxo` e `nz:chidori` nos scripts de progressão. Os arquivos de concessão e limpeza, jutsus, dano, chakra e atributos foram comparados com a base.

## Pack de recursos

Cada modo recebeu um ID de geometria `geometry.swbr.hatake.*` e sua própria animação. Os três IDs antigos duplicados só apareciam nas seis geometrias e nos attachables substituídos.

| Modo | Attachable | Geometria |
| --- | --- | --- |
| Lobo Branco | `attachables/nz170/modo_hatake_lobo_branco.json` | `models/entity/nz170/hatake/modo_lobo_branco.geo.json` |
| Presa do Relâmpago | `attachables/nz170/modo_hatake_presa_relampago.json` | `models/entity/nz170/hatake/modo_presa_relampago.geo.json` |
| Lobo Amaldiçoado | `attachables/nz170/modo_hatake_lobo_amaldicoado.json` | `models/entity/nz170/hatake/modo_lobo_amaldicoado.geo.json` |
| Lobo Branco 2.0 | `attachables/modo_lobo_branco.json` | `models/entity/modo_lobo_branco.geo.json` |
| Presa Relâmpago 2.0 | `attachables/modo_presa_relampago.json` | `models/entity/modo_presa_relampago.geo.json` |
| Lobo Amaldiçoado 2.0 | `attachables/modo_lobo_amaldi#U00e7oado.json` | `models/entity/modo_lobo_amaldi#U00e7oado.geo.json` |

Os demais arquivos alterados e adicionados estão abaixo. O inventário com os nomes completos, contagens e checksums de cada edição está em `Validacao.json`, dentro do ZIP de integração.

| Arquivo ou caminho | Alteração |
| --- | --- |
| `manifest.json` | Versão dos packs 18.11.81. |
| `entity/player.entity.json` | Controle de cabelo enquanto equipado e quatro animações de emissão de faíscas. |
| `render_controllers/player.json` | Filtro da camada externa da cabeça, apenas com os seis modos. |
| `models/entity/swbr39/custom.geo.json` e `custom_b.geo.json` | Dois locators para os pulsos nas mãos, com os pivôs nativos preservados. |
| `render_controllers/swbr_hatake.json` | Material recortado para tecidos e pelagem, emissivo para filamentos. |
| `animations/swbr/hatake/` | Seis ciclos de animação e um arquivo com os quatro ciclos de faíscas. |
| `textures/entity/swbr/hatake/` | Seis atlas RGBA de 256 × 256. |
| `particles/swbr_hatake_azul.json` e `swbr_hatake_roxo.json` | Emissores locais de faíscas com duração de 0,145 s. |
| `textures/particle/swbr_hatake_azul.png` e `swbr_hatake_roxo.png` | Sprites recortados das faíscas azul e violeta. |

## Validação

- Os seis projetos reabriram no Blockbench 4.12.6. A exportação manteve os pivôs, UVs e quadros de animação e a textura incorporada coincide com o PNG do addon.
- A comparação visual em projeções de frente, perfil, costas e três quartos foi feita com o rig do addon. As seis geometrias têm contornos e peças distintos. Os testes geométricos conferiram contato das peças, alcance dos efeitos e alinhamento nas poses de repouso, caminhada, corrida, salto, soco e agachamento simulado.
- Foram avaliados 126 contextos de visibilidade e retirada por item no interpretador MoLang. Em cada edição, 45 contextos adicionais conferiram a restauração do cabelo e o encerramento das animações de faíscas. As partículas já emitidas têm vida curta e se apagam sozinhas.
- O Minecraft Bedrock estava indisponível. A renderização no cliente, a ativação e limpeza real dos itens temporários e a sessão multiplayer seguem pendentes. A compilação sobre o arquivo exato 18.11.64 também segue pendente.

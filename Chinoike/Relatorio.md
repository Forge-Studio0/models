# Alterações Chinoike · 18.11.82

Os cinco itens e seus IDs de geometria foram preservados. O inventário por pacote, com os nomes exatos dos arquivos e os SHA-256 das edições, está em `Validacao.json` no ZIP de integração.

## Pack de comportamento

Somente `manifest.json` recebeu a versão **18.11.82** e a dependência correspondente do RP. O restante do BP foi comparado byte a byte, incluindo os requisitos de nível 12, 20, 40, 55 e 65, as regras do slot da cabeça, o balanceamento e os jutsus. Os scripts de concessão e remoção do `nz:sha_genjutsu` foram preservados. A concessão existente cobre o Ketsuryūgan básico e 8-Dragões.

## Pack de recursos

| Modo | Attachable atualizado | Geometria atualizada |
| --- | --- | --- |
| Ketsuryūgan | `attachables/nz_ketsuryugan.json` e `attachables/nz_ketsuryugan.player.json` | `models/entity/nz_ketsuryugan.geo.json` |
| 8-Dragões | `attachables/nz_ketsuryugan_8dragoes.json` | `models/entity/nz_ketsuryugan_8dragoes.json` |
| Imbuído Half | `attachables/nz_ketsuryugan_halfblood.json` | `models/entity/nz_ketsuryugan_halfblood.geo.json` |
| Imbuído Full | `attachables/nz_ketsuryugan_fullblood.json` | `models/entity/nz_ketsuryugan_fullblood.geo.json` |
| Lua de Sangue | `attachables/nz_ketsuryugan_bloodmoon.json` | `models/entity/nz_ketsuryugan_bloodmoon.geo.json` |

- `animations/nz_ketsuryugan_halfblood.idle.json` e `animations/nz_ketsuryugan_fullblood.idle.json` mantêm seus IDs com movimentos próprios dos canais líquidos.
- `animations/swbr/chinoike/` contém os novos ciclos de Ketsuryūgan e 8-Dragões, três ciclos de Lua de Sangue e as cinco sequências de emissão de gotas. O novo movimento de 8-Dragões dá a cada pescoço uma fase própria.
- `textures/entity/swbr/chinoike/` contém cinco atlas RGBA de 256 × 256. `textures/particle/swbr_chinoike_gota.png` contém o sprite dos dois emissores.
- `render_controllers/swbr_chinoike.json` combina recortes opacos nas massas densas e translucidez nas bordas. `particles/swbr_chinoike_gota_miuda.json` e `particles/swbr_chinoike_gota_densa.json` emitem gotas pontuais de até 0,36 s.
- `entity/player.entity.json` inicia a sequência de gotas do modo equipado e filtra as três sobreposições oculares cosméticas enquanto os olhos Chinoike estão ativos. `models/entity/swbr39/custom.geo.json` e `custom_b.geo.json` receberam pontos de emissão nas têmporas, no dorso, nas mãos e perto dos pés. Os pivôs do avatar e os pontos de emissão dos outros clãs foram preservados.
- `manifest.json` recebeu a versão **18.11.82**.

O modo administrativo `nz:modo_admin_ketsuryugan_chomei` mantém seu attachable, seus recursos e os três arquivos legados `animations/nz_ketsuryugan_bloodmoon.*.json`. O modo normal da Lua de Sangue tem novos IDs de animação e usa o controlador existente para alternar entre repouso, caminhada e agachamento. Sua geometria passou de 119 para 50 ossos e de 392 para 181 cubos.

## Verificações

- Os cinco `.bbmodel` reabriram no Blockbench 4.12.6 e reexportaram as mesmas geometrias, UVs e animações. Cada textura incorporada corresponde ao PNG do RP.
- Comparei os modelos de frente, de perfil e de costas com o rig do addon. Foram conferidos os dois olhos rente à face, as oito cabeças, o revestimento assimétrico do Half, os pontos de apoio do Full e o anel posterior da Lua de Sangue.
- A auditoria verificou o encaixe em amostras de repouso, caminhada, corrida, salto, soco e agachamento simulado. O anel ficou atrás do torso nas amostras.
- O interpretador MoLang testou 126 contextos de visibilidade e retirada por attachable, incluindo a variante `nz:ketsuryugan.player`. Em cada edição, 486 contextos de jogador cobriram equipar, trocar de estágio, remover e usar outras câmeras. O disparo das partículas encerra ao perder o modo e as gotas emitidas expiram.
- O cliente Bedrock e o arquivo exato 18.11.64 estavam indisponíveis. Ficam pendentes os testes no jogo, inclusive renderização móvel, skins variadas e uso de jutsus durante as transformações.

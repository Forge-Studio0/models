# Clã Aburame — SWBR 18.11.72

Reconstrução dos seis modos sobre a **18.11.68 com o Iburi aprovado**. Os seis itens continuam no **slot da cabeça**, com os mesmos identificadores, níveis, atributos, desbloqueios e regras de raridade.

A **18.11.72** corrige três pontos das capturas. Os enxames usam recortes opacos para sustentar o contraste. O violeta é aplicado à textura das peles SWBR para evitar sobreposição no corpo. O rastreio desenha pequenos marcadores escuros só quando encontra um alvo. [Diagnóstico e correção](Correcao_Visual.md)

## Downloads

- [Aburame.zip — entrega completa](https://github.com/Forge-Studio0/models/raw/refs/heads/main/Aburame/Aburame.zip): addon, integração, seis projetos do Blockbench e relatórios.
- [Aburame.mcaddon — addon completa atualizada](https://github.com/Forge-Studio0/models/raw/refs/heads/main/Aburame/Aburame.mcaddon).
- [Aburame_Integracao.zip — arquivos para integrar e editar](https://github.com/Forge-Studio0/models/raw/refs/heads/main/Aburame/Aburame_Integracao.zip).
- [Seis modelos editáveis](Modelos_Blockbench), com textura e animação embutidas.

## Os seis modos

| Modo | Identificador existente | Nível | Reconstrução visual |
| --- | --- | ---: | --- |
| 1 — Insetos | `nz:insetos_aburame_m` | 10 | Pequenas concentrações junto aos punhos e antebraços, com besouros individuais nos braços e ombros. |
| 2 — Insetos venenosos | `nz:insetos_aburame_m2` | 10 | Violeta fosco nas mãos, com bordas que se dissipam pelo antebraço. |
| 3 — Insetos imbuídos | `nz:insetos_aburame_half` | 20 | Enxames mais compactos nos braços, ombros, flancos e costas, com espaços entre eles. |
| 4 — Venenosos imbuídos | `nz:insetos_aburame_half_poison` | 30 | Violeta dos antebraços aos ombros e às laterais do tronco, com transição mais leve no centro do peito. |
| 5 — Totalmente imbuído | `nz:insetos_aburame_full` | 40 | Colônia densa e assimétrica, com vários planos ao redor dos braços e focos menores perto das pernas. |
| 6 — Venenoso totalmente imbuído | `nz:insetos_aburame_full_poison` | 50 | Revestimento violeta contínuo com manchas suaves e maior translucidez na frente do rosto. |

Os estágios seguem a progressão da SWBR. Os modos comuns usam besouros modelados, recortes vazados em profundidades diferentes e partículas. Os venenosos tingem a pele e acrescentam pontos microscópicos. O modelo inclui uma sobreposição de compatibilidade para quem usa uma skin fora do seletor da SWBR.

## Instalação da addon

Importe `Aburame.mcaddon` no Minecraft Bedrock e selecione o Behavior Pack e o Resource Pack **18.11.72** no mundo. Esta é a addon completa, incluindo os sistemas da base e o Iburi aprovado.

O requisito de motor da base, **1.26.10**, e suas dependências de Script API foram mantidos. Equipar continua sendo pelo sistema original da addon. Para conferir cada item separadamente com comandos habilitados, use `/give @s` seguido do identificador da tabela e equipe na cabeça.

Os efeitos acompanham os bones do jogador. A representação fica oculta em primeira pessoa, inventário, paperdoll, mapa e espectador. As malhas do enxame e as partículas ficam ocultas quando a câmera chega a **2,8 blocos** do jogador. Já o violeta integrado à pele SWBR continua visível em terceira pessoa de perto, pois faz parte da própria textura do corpo.

As malhas deixam de ser desenhadas ao desequipar ou trocar de modo; o controlador sai do estado de emissão. As partículas têm vida curta, de no máximo **0,45 segundo**, e espaço local ligado ao jogador. A confirmação do descarte final no motor depende de teste dentro do Minecraft.

## Integração na base aprovada

`Aburame_Integracao.zip` contém o overlay em `Integracao/BP` e `Integracao/RP`, o manifesto de arquivos e o aplicador. Ele aceita somente a base 18.11.68 com esta assinatura:

```text
fbcd94172035065c04d38d8060ebd132956cd66855eecbe494431108aab7fe40
```

Após extrair o ZIP, execute com Python 3:

```sh
python aplicar_integracao.py "caminho/SWBR_18.11.68_IBURI.mcaddon" "Aburame.mcaddon"
```

O aplicador não sobrescreve a entrada. Os arquivos `entity/player.entity.json` e `models/entity/swbr39/custom*.geo.json` contêm também vínculos existentes do jogador; **não aplique este overlay cegamente em outra versão da addon**. Para versões posteriores, faça a mesclagem a partir desses arquivos e de `Integracao_Manifesto.json`.

## Preservação e validação

O Behavior Pack atualiza o manifesto e o desenho dos marcadores de rastreio. O sensor mantém a busca, o alcance e o indicador de alvo. Itens, atributos, jutsus, níveis, câmera e as regras de `AburameRaro` foram conferidos contra a base.

Os recursos do Iburi e os demais sistemas foram preservados. Apenas vínculos exclusivos Aburame foram acrescentados ao jogador, com locators novos nos bones existentes.

Foram verificados os arquivos dos packs, referências, UVs, transparência, hierarquias, limites de geometria, expressões Molang, condições de câmera e transições de troca/remoção. Os seis projetos foram abertos, exportados e reabertos no **Blockbench 4.12.6**. A análise de exposição usa quatro projeções numéricas; não produz imagens.

**Não houve execução no Minecraft.** A aparência final, andar/correr/pular/agachar, multiplayer, descarte de partículas no motor e desempenho em celulares ainda precisam de confirmação no jogo. Os limites e resultados estão em [Relatorio_Tecnico.md](Relatorio_Tecnico.md), `Validacao.json`, `Validacao_Blockbench.json`, `Validacao_Molang.json` e `Validacao_Visual_Estatica.json`.

Texturas e recursos nativos ficam em `Integracao/RP`. Abra o `.bbmodel` correspondente em `Modelos_Blockbench` para editar as peças e o atlas. Nos modos venenosos, o gerador também usa o atlas para compor as variantes de pele que aparecem no jogo. [Fontes de construção](Fontes/README.md)

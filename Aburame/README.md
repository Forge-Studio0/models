# Clã Aburame — SWBR 18.11.69

Reconstrução dos seis modos sobre a **18.11.68 com o Iburi aprovado**. Os seis itens continuam no **slot da cabeça**, com os mesmos identificadores, níveis, atributos, desbloqueios e regras de raridade.

## Downloads

- [Aburame.zip — entrega completa](https://github.com/Forge-Studio0/models/raw/refs/heads/main/Aburame/Aburame.zip): addon, integração, seis projetos do Blockbench e relatórios.
- [Aburame.mcaddon — addon completa atualizada](https://github.com/Forge-Studio0/models/raw/refs/heads/main/Aburame/Aburame.mcaddon).
- [Aburame_Integracao.zip — arquivos para integrar e editar](https://github.com/Forge-Studio0/models/raw/refs/heads/main/Aburame/Aburame_Integracao.zip).
- [Seis modelos editáveis](Modelos_Blockbench), com textura e animação embutidas.

Não foram geradas prévias.

## Os seis modos

| Modo | Identificador existente | Nível | Reconstrução visual |
| --- | --- | ---: | --- |
| 1 — Insetos | `nz:insetos_aburame_m` | 10 | Besouros pequenos nos braços e ombros, grupos espaçados, rastejo e voos curtos. |
| 2 — Insetos venenosos | `nz:insetos_aburame_m2` | 10 | Revestimento violeta escuro nas mãos e antebraços; pontos microscópicos com dispersão curta. |
| 3 — Insetos imbuídos | `nz:insetos_aburame_half` | 20 | Mais besouros e grupos nos braços, ombros, flancos e costas; cabeça livre. |
| 4 — Venenosos imbuídos | `nz:insetos_aburame_half_poison` | 30 | Revestimento nos braços e partes do tronco, limites irregulares e pequenas nuvens junto às mãos. |
| 5 — Totalmente imbuído | `nz:insetos_aburame_full` | 40 | Colônia densa com várias profundidades, grupos assimétricos, expansão e retorno; corpo reconhecível. |
| 6 — Venenoso totalmente imbuído | `nz:insetos_aburame_full_poison` | 50 | Revestimento microscópico violeta em quase todo o corpo e pequenos agrupamentos próximos à superfície. |

Os estágios são a progressão do sistema SWBR; não representam seis transformações oficiais do anime. Os modos comuns usam besouros modelados, recortes transparentes em diferentes profundidades e partículas. Os venenosos usam revestimentos aderidos à geometria humana, textura de colônias microscópicas e pontos escuros. Nenhum modo usa asas, carapaça de inseto gigante ou brilho emissivo.

## Instalação da addon

Importe `Aburame.mcaddon` no Minecraft Bedrock e selecione o Behavior Pack e o Resource Pack **18.11.69** no mundo. Esta é a addon completa, incluindo os sistemas da base e o Iburi aprovado. Confira se o mundo está usando os dois packs atualizados, sem outra versão dos mesmos packs ativa por cima.

O requisito de motor da base, **1.26.10**, e suas dependências de Script API foram mantidos. Equipar continua sendo pelo sistema original da addon. Para conferir cada item separadamente com comandos habilitados, use `/give @s` seguido do identificador da tabela e equipe na cabeça.

Os efeitos acompanham os bones do jogador. A representação fica oculta em primeira pessoa, inventário, paperdoll, mapa e espectador. Há também uma proteção de proximidade: os efeitos ficam ocultos quando a distância da câmera ao jogador é de até **2,8 blocos**, com entrada gradual até 3,0. Isso pode ocultá-los em terceira pessoa quando uma parede aproxima a câmera.

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

O Behavior Pack permanece byte a byte igual à base, exceto pelo manifesto de versão. Isso mantém itens, atributos, jutsus, níveis, câmera e regras de raridade. `AburameRaro` continua com a atribuição e as verificações originais: a entrada venenosa inicial do menu exige essa tag; as entradas posteriores mantêm as condições que já existiam, sem novos bloqueios.

Os recursos do Iburi e os demais sistemas foram preservados. Apenas vínculos exclusivos Aburame foram acrescentados ao jogador, com locators novos nos bones existentes.

Foram verificados os arquivos dos packs, referências, UVs, transparência, hierarquias, limites de geometria, expressões Molang, condições de câmera e transições de troca/remoção. Os seis projetos foram abertos, exportados e reabertos no **Blockbench 4.12.6**. A análise de exposição usa quatro projeções numéricas; não produz imagens.

**Não houve execução no Minecraft.** A aparência final, andar/correr/pular/agachar, multiplayer, descarte de partículas no motor e desempenho em celulares ainda precisam de confirmação no jogo. Os limites e resultados estão em [Relatorio_Tecnico.md](Relatorio_Tecnico.md), `Validacao.json`, `Validacao_Blockbench.json`, `Validacao_Molang.json` e `Validacao_Visual_Estatica.json`.

Texturas e recursos nativos ficam em `Integracao/RP`. Para editar, abra o `.bbmodel` correspondente em `Modelos_Blockbench`. As malhas de desenho são subconjuntos do modelo mestre, separados por material e pelo limite de bones; ao alterar peças, regenere também esses subconjuntos e os relatórios conforme [Fontes/README.md](Fontes/README.md).

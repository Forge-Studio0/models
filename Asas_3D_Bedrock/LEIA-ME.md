# Asas 3D Teste — Minecraft Bedrock

Versão 1.1.0 · duas opções cosméticas estáticas · slot do peitoral.

## Instalar

1. Baixe e abra **Asas_3D_Teste_Bedrock.mcaddon** com o Minecraft Bedrock e aguarde a importação dos dois packs. Se já usa a versão 1.0, importe este arquivo como atualização para a versão 1.1.0.
2. Nas configurações de um mundo, ative **Asas 3D Teste | Comportamentos** e confirme que **Asas 3D Teste | Recursos** está ativo.
3. Entre no mundo. Os itens ficam na categoria **Equipamentos**, junto aos peitorais, ou podem ser obtidos pelos comandos abaixo com cheats ativados.
4. Arraste uma das asas para o slot de peitoral do inventário. Use a câmera de terceira pessoa para vê-las. Remova o item para retirar as asas.

```mcfunction
/give @s asas_teste:chamas_azuis 1
/give @s asas_teste:chamas_rosas 1
```

O slot comporta um item por vez. Não há receita nesta primeira versão. A base de formato escolhida é **Bedrock 1.21.0 ou superior**, com componentes estáveis e sem experimentos.

## Modelos

**Asas de Chamas Azuis**: quatro asas, superiores longas e inferiores com lobos e pontas voltadas para baixo, contornos irregulares, azuis intensos, turquesa e ciano. Textura de chamas curvas e redemoinhos, com curvas adicionais em relevo.

**Asas Espirituais Rosas**: quatro asas com silhueta própria, fundo rosa/magenta, bordas claras e línguas amarelas e douradas. Filamentos amarelos elevados e bordas parcialmente translúcidas.

Os modelos usam volumes de profundidade variável, cuboides rotacionados e camadas sobrepostas. As texturas de 1024 × 1024 têm UV por face, incluindo frente, verso e laterais. Não são duas imagens sobre planos. A geometria estática é deliberadamente facetada para o formato Bedrock; não é uma reprodução do traço 2D da animação.

A raiz central foi reduzida e arredondada em três volumes. Ela toca as costas em Z = 1,95 unidades de modelo. O corpo padrão termina em Z = 2. As asas se abrem e recuam levemente com rotação fixa. A hierarquia `waist → body → quatro asas` usa os nomes e pivôs da armadura do jogador, para herdar o movimento do tronco tanto em Steve quanto em Alex. Nenhum arquivo da skin ou da entidade do jogador é substituído.

O brilho é sugerido por cores claras e bordas translúcidas, usando os materiais nativos `entity_alphatest` e `entity_alphablend`. Não emite luz no mundo, não requer shader externo e não inclui voo, partículas, animações próprias ou habilidades. A iluminação do jogo ainda influencia a aparência.

As texturas foram refeitas com chamas contínuas e ramificações amarelas conectadas. A geometria usa contorno de 0,4 unidade, biséis estreitos e correntes de energia em relevo nas duas faces. A abertura das superiores foi revista para melhorar a proporção no corpo. Veja o histórico em `ALTERACOES.md` e as dimensões comparadas em `Comparacao_Versoes.json`.

## Conteúdo dos fontes

- `Asas_3D_BP/`: manifest e os dois itens com `minecraft:wearable` em `slot.armor.chest`.
- `Asas_3D_RP/`: manifest, duas geometrias, dois attachables, render controller, texturas, ícones e nomes.
- `Modelos_Blockbench/Asas_Azuis.bbmodel` e `Asas_Rosas.bbmodel`: projetos independentes, com texturas embutidas. Podem ser abertos diretamente em **File → Open Model** no Blockbench, sem plugins.
- `Ferramentas/Arte/`: pinturas-base em PNG. O gerador prepara o atlas e compartilha o desenho da metade direita entre as asas espelhadas, mantendo o equilíbrio visual.
- `Ferramentas/`: código completo de construção, inspeção visual e validação; cópias dos schemas usados.
- `Previews/`: renders de inspeção a partir das geometrias reais, com manequim de escala. São prévias externas, não capturas do Minecraft.
- `Validacao_Estatica.json`, `Validacao_Blockbench.json` e `Estatisticas_Modelos.json`: resultados e contagens.

Para editar, abra o `.bbmodel`, altere cubos/textura e exporte em **Bedrock Model**. Mantenha o identificador da geometria. Ao alterar a textura, exporte também o PNG e substitua o correspondente em `Asas_3D_RP/textures/entity/asas_teste/`.

## Reproduzir a construção

Requer Python 3 com `numpy`, `Pillow`, `scipy` e `jsonschema`:

```sh
python -m pip install -r Ferramentas/requirements.txt
python Ferramentas/build_wings.py --package dist
python Ferramentas/validate_wings.py dist/Asas_3D_Teste_Bedrock.mcaddon
```

O gerador recria os packs e os modelos a partir das pinturas-base incluídas, convertendo o recorte em volumes sólidos e as correntes de energia em relevo. Não precisa chamar um serviço de geração de imagens. Faça uma cópia das suas edições manuais antes de regenerar. Os renders podem ser refeitos com Blender 4.3:

```sh
blender -b --python Ferramentas/render_wings.py
```

## Verificação e limites

A sintaxe, schemas, UUIDs, dependências, slot, referências, PNGs, UVs, dimensões positivas, hierarquia, orientação traseira, limites de renderização e conteúdo dos arquivos internos do `.mcaddon` foram conferidos. Os projetos também foram abertos e exportados no **Blockbench 4.12.6**, com texturas carregadas e sem erros de importação.

**Não houve teste dentro do Minecraft.** O ambiente disponível permite validação estática e inspeção no editor. A importação no jogo, a renderização por plataforma e as poses de caminhada, corrida, agachamento, salto e giro precisam de confirmação no Bedrock. Para testar, equipe cada item, experimente essas poses e remova-o novamente.

## Referências técnicas usadas

- [Microsoft Learn — Using Attachables](https://learn.microsoft.com/en-us/minecraft/creator/documents/attachables?view=minecraft-bedrock-stable)
- [Microsoft Learn — minecraft:wearable](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/itemreference/examples/itemcomponents/minecraft_wearable?view=minecraft-bedrock-stable)
- [Microsoft Learn — Materials and Material Files](https://learn.microsoft.com/en-us/minecraft/creator/documents/material-files?view=minecraft-bedrock-stable)
- [Mojang — geometria de armadura do jogador](https://github.com/Mojang/bedrock-samples/blob/main/resource_pack/models/entity/player_armor.json)
- [Blockbench — codecs Bedrock e projeto](https://github.com/JannisX11/blockbench/tree/v4.12.6/js/io/formats)
- [Blockception — schemas Bedrock](https://github.com/Blockception/Minecraft-bedrock-json-schemas) (licença MIT, incluída junto aos schemas).

As duas imagens fornecidas pelo usuário orientaram as cores, a composição e as silhuetas. Os arquivos de geometria e de textura foram construídos para esta entrega.

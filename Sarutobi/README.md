# Sarutobi · Shinobi World BR 18.11.78

Revisão visual de Earth Monkey, Earth Monkey V2 e 5 Elementos a partir das capturas do jogo.

| Modo | Referência do anime | Problema no addon anterior | Revisão |
| --- | --- | --- | --- |
| Earth Monkey, nível 5 | O Doton de Hiruzen orienta o aspecto de rocha. Earth Monkey é uma forma criada para o addon. | Os braços tinham volumes laranja com textura de cristal. A cauda clara podia parecer uma peça solta. | Manoplas menores de rocha estratificada, punhos de linho e cauda curta ligada ao cinto. |
| Earth Monkey V2, nível 12 | Hiruzen invoca Enma. A crina de Enma orienta o acabamento cinza-claro. | O ombro e o antebraço usavam mais placas da mesma aparência. O conjunto tinha variantes incompatíveis com a animação da cauda. | Ombreiras, colete e gola curta de crina. A cauda mantém três segmentos conectados durante o movimento. |
| 5 Elementos, nível 18 | Hiruzen combina cinco naturezas de chakra com seus clones. | Volumes azuis, vermelhos e brancos orbitavam o personagem. A geometria alternativa usava nomes de ossos diferentes dos da animação. | Cinco símbolos no colete representam fogo, vento, raio, terra e água. O modelo acompanha a pose humana com placas nas pernas, cintura e braços. |

As referências visuais são o Doton de Hiruzen, o Rei Macaco Enma e a combinação das cinco naturezas. [Enma](https://naruto.fandom.com/wiki/Monkey_King:_Enma), [Doton — Muralha de Terra](https://naruto.fandom.com/wiki/Earth_Release:_Earth-Style_Wall), [Combinação das cinco naturezas](https://naruto.fandom.com/wiki/Five_Release_Great_Combo_Technique).

O pacote anterior usava três definições por identificador nos modelos desses itens. Os três attachables da revisão referenciam geometrias próprias e animações com ossos correspondentes. A peça branca segmentada pertencia à cauda. A geometria anterior de 5 Elementos continha também formas elementais animadas. A origem do azul visível na captura identificada como Earth Monkey fica sem confirmação.

## Instalar e testar

- Para mundos com Iburi, Aburame, Kaguya e Hōzuki. [Baixar Sarutobi_Cumulativo.mcaddon](https://github.com/Forge-Studio0/models/raw/refs/heads/main/Sarutobi/Sarutobi_Cumulativo.mcaddon)
- Para mundos com Hōzuki na base original 18.11.64. [Baixar Sarutobi.mcaddon](https://github.com/Forge-Studio0/models/raw/refs/heads/main/Sarutobi/Sarutobi.mcaddon)

Abra a edição correspondente no Minecraft Bedrock e confira a versão **18.11.78** nos packs de comportamento e recursos. Equipe os itens no slot da cabeça. A armadura é visível em terceira pessoa enquanto o item estiver equipado. Os IDs `nz:modo_sarutobi_v1`, `nz:modo_sarutobi_v2` e `nz:modo_sarutobi_v3` continuam sendo os do menu.

## Edição e integração

Os projetos usam texturas de 256 × 256 e incluem o ciclo da cauda. [Modelos Blockbench](Modelos_Blockbench/)

O ZIP inclui os três projetos, geometrias, PNGs, animações, attachables e scripts de construção e validação. [Baixar Sarutobi_Integracao.zip](https://github.com/Forge-Studio0/models/raw/refs/heads/main/Sarutobi/Sarutobi_Integracao.zip)

Extraia o ZIP e execute o comando abaixo para aplicar a revisão a uma das edições Hōzuki 18.11.77 registradas no manifesto.

```sh
python Fontes/aplicar_integracao.py /caminho/Hozuki_Cumulativo.mcaddon Sarutobi_Integrado.mcaddon
```

A auditoria confere a integridade dos packs, os vínculos de geometria e animação, a escala por idade, o slot e o desequipamento. O pacote de comportamento mudou apenas no manifesto de versão. Os arquivos de jutsus, invocação e bastão de Enma foram preservados. Os projetos reabriram no Blockbench. O teste dentro do Minecraft Bedrock segue pendente.

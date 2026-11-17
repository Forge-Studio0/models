# Revisão dos três níveis Iburi — 18.11.68

As imagens identificadas pelo usuário como níveis 1, 2 e 3 mostram uma progressão visual insuficiente. O primeiro aparece compacto e escuro, o segundo quase se confunde com a skin e o terceiro acrescenta uma camada fina. Os recortes não mostram a distância da câmera nem o estado completo dos packs; esses valores não foram deduzidos das imagens.

## Problema confirmado nos arquivos

Parte dos volumes permanentes estava dentro da geometria opaca do jogador. Por exemplo, o braço da addon chega aproximadamente a Z = −2,02 na frente; uma nuvem antiga do ombro começava em aproximadamente Z = −0,45 antes de sua rotação. Na vista frontal, a pele ficava à frente de grande parte dessa nuvem e a escondia.

Os emissores também usavam vários pontos no interior dos braços, pernas, tronco e cabeça. Aumentar apenas a opacidade não corrigiria o problema de profundidade.

## Alterações executadas

| Nível | Geometria e distribuição | Opacidade e movimento |
| --- | --- | --- |
| 1 | 13 volumes. Ombros e antebraços deslocados para a frente e para fora dos braços; laterais e costas com massas separadas. | Centro cinza mais visível, bordas suaves, pequenas oscilações e camadas ascendentes. Cabeça e pernas continuam sem cobertura própria. |
| 2 | 29 volumes. Nuvens maiores fora dos braços; cobertura frontal do tronco; massas na frente e atrás das pernas. | Mais área e densidade que o primeiro nível, com regiões de skin visíveis entre as nuvens. |
| 3 | 50 volumes. Mais camadas externas à frente e atrás do tronco, nos membros, na frente, laterais e topo da cabeça. | Maior densidade e recomposição contínua, mantendo a forma humana. O corpo sólido continua presente sob a cobertura. |

Os pontos de emissão foram deslocados para posições externas à pele, mantendo seus vínculos com os bones. O teste de partículas verifica que os centros não ficam dentro dos cubos opacos da geometria de referência e que seu envelope continua dentro da distância de proteção da câmera.

## Mudança de renderização

A versão anterior desenhava a mesma geometria sete vezes com máscaras diferentes de bones. A análise estática não comprova que havia um conflito de cache no Bedrock, mas essa técnica mantinha uma dependência desnecessária de máscaras concorrentes sobre a mesma malha.

A 18.11.68 utiliza uma geometria própria por camada. Cada estágio tem uma malha de volumes permanentes e seis de dissipação. Nenhum render controller da fumaça usa `part_visibility`. Os bones das nuvens também têm nomes exclusivos por nível.

Os três `.bbmodel` são os modelos completos para edição. O arquivo `swbr_iburi_draw.geo.json` contém os subconjuntos usados no jogo. A validação confere que a união das camadas corresponde aos cubos do modelo completo, sem perda ou duplicação, e que cada malha possui no máximo 64 bones como orçamento adotado para estes assets. Isso não é uma declaração de limite universal do Bedrock.

## Transparência e proteção da câmera

A paleta permanece estritamente cinza. A área central dos sprites ficou mais larga e os alfas foram ajustados por estágio, com bordas de alfa zero. A proteção de primeira pessoa foi preservada.

O corte por proximidade continua em 2,8 blocos da origem do jogador à câmera. A entrada gradual da geometria foi encurtada: termina em 3,0 blocos, em vez de 3,5. Isso reduz o enfraquecimento da fumaça em uma câmera de terceira pessoa relativamente próxima, sem remover o corte de segurança.

Os emissores continuam ligados ao jogador e simulados em posição e rotação locais. Seus limites de quantidade, duração e tamanho foram preservados. Os três itens continuam no slot da cabeça. Não há alteração de câmera, FOV, física, dano, requisitos, níveis, jutsus, outros clãs ou sistemas administrativos.

## Verificação nova: fumaça escondida pela pele

`Validacao_Exposicao.json` registra uma projeção geométrica aproximada dos volumes permanentes contra os cubos opacos reais do jogador, em pose de base e com margem de roupa de 0,25 unidade. As faces são amostradas com seus UVs, alfa e rotação; pontos ocultos pela pele são descartados. São verificadas frente, costas e os dois lados.

Na vista frontal, a porcentagem da silhueta de referência com fumaça de alfa composto de pelo menos 0,15 foi:

| Nível | 18.11.67 | 18.11.68 |
| --- | --- | --- |
| 1 | aproximadamente 0,1% | aproximadamente 16,3% |
| 2 | aproximadamente 4,3% | aproximadamente 40,4% |
| 3 | aproximadamente 38,3% | aproximadamente 80,0% |

Esses números descrevem **a projeção estática**, em força plena de distância. Não são medição nem render do Minecraft. A comparação não inclui cabelos ou modelos adicionais, poses em movimento, partículas, camadas transitórias, iluminação, shader ou a ordenação real do Bedrock. Ela serve para detectar o erro de volumes ocultos e conferir a progressão geométrica entre estágios.

Os demais relatórios verificam os JSONs, os recursos dentro da addon, as geometrias por camada, ciclos Molang, condições de câmera, emissores e a abertura e reabertura dos três projetos no Blockbench. O aplicador de integração é conferido com as bases reconhecidas. Os arquivos fora do escopo são comparados para preservar os sistemas existentes.

## Limites da entrega

Minecraft Bedrock não foi executado neste ambiente. A aparência final no jogo, a movimentação, a observação por outro jogador e o desempenho no dispositivo precisam de confirmação real.

A ocultação da skin não foi reintroduzida. A solução temporária continua sendo uma cobertura de fumaça sobre o corpo, com maior densidade no terceiro nível, até que uma substituição integral possa ser comprovada no jogo.

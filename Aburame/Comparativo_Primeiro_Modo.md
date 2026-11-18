# Primeiro modo: comparação com Shino e revisão 18.11.70

## O que foi observado

O vídeo enviado pelo usuário mostra aproximadamente 1,27 segundo do modo ativo, em terceira pessoa frontal. No enquadramento original, o personagem ocupa uma área pequena da tela. Os insetos pretos junto aos braços aparecem, mas a distribuição fica dispersa e as pequenas concentrações são pouco legíveis. Essa gravação não demonstra troca, remoção ou um ciclo completo de movimento.

A imagem de Shino com enxames nos braços, citada em `Referencias.md`, mostra uma diferença relevante: os kikaichū se acumulam em concentrações escuras junto às mangas e antebraços. Organismos individuais se desprendem desses grupos, com vazios e bordas irregulares. O volume nasce dessas concentrações; não depende apenas de uma nuvem distante do corpo.

Não se copiou toda a densidade da cena de combate para o estágio inicial. Os seis estágios pertencem à progressão da addon; o primeiro precisa manter cabeça, tronco e maior parte da skin visíveis, com menos insetos que os estágios 3 e 5.

| Aspecto | Resultado anterior no jogo | Ajuste implementado |
| --- | --- | --- |
| Concentração junto às mangas | Pontos pequenos e espaçados | Duas colônias adicionais sobre a frente dos antebraços, compostas por faces cruzadas com recortes vazados. |
| Continuidade sobre os braços | Poucos besouros isolados | Quatro besouros adicionais, distribuídos na frente e atrás dos antebraços. |
| Leitura dos organismos | Detalhes muito pequenos no enquadramento | Besouros 3D 10% maiores; ainda menores que uma unidade de modelo, incluindo o recorte de pernas. |
| Densidade dos grupos | 22 organismos desenhados por célula de enxame | 32 organismos por célula, preservando intervalos transparentes. |
| Silhueta | Corpo original visível | Cabeça e tronco continuam livres; mantém progressão de densidade para os modos seguintes. |

O primeiro modelo passou de **12 para 16 besouros 3D** e de **4 para 6 agrupamentos**, totalizando **62 bones e 98 cubos**. Os agrupamentos permanecem em profundidades diferentes, com fases independentes e movimentos de desprendimento/retorno.

## Elemento separado encontrado no vídeo

Os insetos grandes azulados correspondem à textura `textures/particle/swbr32/insect.png`, emitida como `swbr:track_insect32` pelo sistema de rastreio. Essa origem foi confirmada no script `swbr32_tracking.js`, que emite cinco marcadores privados quando o sensor de insetos está ativo. Esses recursos continuam iguais; esta revisão trata do primeiro modelo e mantém o funcionamento do rastreio.

## Verificações e limites

O modelo editado é exportado e reaberto no Blockbench. Os validadores conferem UVs, hierarquias, materiais, limites de movimento, exposição nas quatro direções e a progressão de densidade entre estágios. A addon e o pacote de integração são reconstruídos com versões de pack atualizadas.

Os recursos específicos dos modos 2–6 e seus projetos `.bbmodel` são preservados em relação à 18.11.69. A revisão não altera atributos, níveis, raridade, itens, jutsus, rastreio ou Iburi. O BP muda somente o manifesto de versão.

O vídeo é evidência da versão anterior. **A aparência da revisão 18.11.70 ainda não foi confirmada dentro do Minecraft.** A análise numérica não substitui iluminação, escala percebida, poses e renderização do motor. Não se afirma equivalência exata ao desenho do anime.

# Revisão Iburi 18.11.67

As capturas enviadas mostram uma massa escura vista de cima e uma superfície de fumaça cobrindo quase toda a tela em primeira pessoa. Elas confirmam a falha visual da entrega anterior. Não há log de conteúdo ou captura de diagnóstico do renderizador, portanto não foi possível atribuir cada pixel a uma única causa interna do Bedrock.

## Achados e correções

| Achado | Evidência e alcance | Correção implementada |
| --- | --- | --- |
| Indicador de primeira pessoa dependia do item | A 18.11.66 usava `context.is_first_person`. O jogador SWBR usa `v.is_first_person` e `v.swbr_view_first_person`. Um teste com primeira pessoa nativa ativa e contexto do item em zero reproduz uma condição em que a máscara anterior permite a fumaça. Não se afirma que os valores internos da captura foram medidos. | Efeito transferido para o jogador, usando os indicadores nativos existentes. Bloqueio aplicado ao controlador inteiro e aos emissores, antes de selecionar folhas da geometria. |
| Malha de corpo no attachable da cabeça | O item carregava todas as nuvens, inclusive as da cabeça. O attachable também podia existir na mão. | Attachables mantidos com geometria vazia, sem animações ou partículas. O corpo de fumaça é renderizado somente pelo jogador equipado com o modo. |
| Câmera pode entrar no volume mesmo em terceira pessoa | A câmera pode se aproximar ao encontrar uma parede ou olhar de cima. Bloquear apenas primeira pessoa não cobre esse caso. | Corte até 2,8 blocos entre origem e câmera e entrada gradual da geometria até 3,5. O envelope radial dos modelos é medido nos testes; isso não substitui uma verificação de todas as poses no motor do jogo. |
| Sobreposição muito escura | A versão anterior permitia texturas de alfa próximo de 0,96 em dezenas de volumes com várias faces. Isso favorece regiões muito densas e pode contribuir para o aspecto escuro. Não foi comprovado defeito no shader nativo. | Atlas com cinzas mais claros e alfas moderados; alfa central adicional de 0,68/0,73/0,78, multiplicado pela transição da câmera. Material nativo `entity_alphablend`, sem shader personalizado. |
| Billboard podia ficar grande perto da cabeça | A meia largura anterior chegava a cerca de 0,41 m no terceiro estágio. Não há medição de que ele tenha produzido sozinho a tela cinza. | Meia largura máxima de 0,15/0,19/0,22 m e quantidade máxima de 12/24/27 partículas por personagem e cliente. |
| Divisão por duração sem proteção | As expressões anteriores dividiam diretamente pela duração da partícula. Duração zero não foi observada em log; era uma fragilidade possível. | Denominador mínimo 0,001, idade normalizada limitada a 0–1 e testes de tamanho/alfa inclusive com duração zero e idade fora da faixa. |
| Limite do flipbook | A textura tem quatro linhas. O índice máximo foi limitado explicitamente a 3 para garantir que nenhuma leitura ultrapasse a altura da imagem. | UVs conferidos e limite atualizado. |
| Locators dependiam da geometria do attachable | A emissão anterior ocorria no contexto do item. | Locators com prefixo `swbr_iburi_` acrescentados às duas geometrias humanas principais, sem alterar seus cubos, pivôs ou animações. Emissores ligados ao ator e simulados em espaço local. |
| Testes anteriores não cobriam a discrepância de câmera | Conferir a expressão antiga supondo o contexto correto não detectava a falha quando o contexto do item e o indicador nativo divergiam. | Os testes executam o programa de câmera do jogador e os gates dos controladores reais; incluem contexto do item em zero e em um, independentemente da perspectiva nativa. |

## Escopo preservado

O Behavior Pack não recebeu nova lógica de câmera, invisibilidade, física ou combate. Seus arquivos fora do manifesto e dos três nomes de apresentação Iburi são comparados byte a byte com as bases. Os itens, níveis 10/15/25, atributos, jutsu, menus, híbridos e sistemas administrativos permanecem preservados.

O corpo sólido continua visível sob a fumaça em todos os estágios. Nenhum comando de ocultação Iburi foi reintroduzido. Os vínculos existentes do jogador são comparados estruturalmente, removendo apenas as adições com nomes exclusivos do Iburi para fazer a comparação.

A fumaça não é exibida na primeira pessoa, no inventário, no paperdoll, no ícone de mapa ou no espectador. Na terceira pessoa e para observadores, ela só entra quando a câmera está fora da distância de proteção. Isso também reduz a fumaça vista por observadores próximos.

## Verificações executadas

- Integridade dos ZIPs, CRCs, manifests, UUIDs, versões e dependências.
- Comparação com a entrega 18.11.66, a 18.11.65 e a base original 18.11.64.
- Geometrias sem identificadores duplicados, hierarquia sem ciclos, UVs dentro dos atlas e volumes com espessura.
- Referências entre jogador, animações, render controllers, controladores de partículas, locators e texturas.
- Condições de câmera nativas, UI, paperdoll, mapa, espectador, proximidade, item desequipado e três modos.
- Caso de regressão em que o indicador nativo de primeira pessoa é um e `context.is_first_person` é zero.
- Quatro ciclos de nuvens amostrados por estágio; limites finitos de posição, escala, alfa e raio.
- Partículas com duração zero, duração normal e idades negativas ou superiores à duração; tamanho e alfa precisam continuar finitos e limitados.
- Abertura, exportação e reabertura dos três projetos no Blockbench. Relatórios vinculados por SHA-256 aos recursos atuais.
- Aplicador extraído do ZIP executado sobre uma base reconhecida e resultado comparado com a addon entregue.

Os números efetivamente executados e as assinaturas ficam nos relatórios `Validacao*.json`. Não foram geradas prévias de modelos.

## O que não foi comprovado no jogo

Minecraft Bedrock não está instalado neste ambiente. As verificações não equivalem a um teste do renderizador, de multiplayer ou de desempenho em celular. A reprodução visual, as transições de perspectiva, o encaixe durante movimentos e a remoção final das partículas ainda precisam de confirmação no jogo.

A substituição completa da skin por uma silhueta exclusivamente de fumaça não é declarada concluída. Foi mantida a solução temporária autorizada: corpo visível com cobertura em terceira pessoa e visão livre de fumaça em primeira pessoa.

## Referências técnicas

- [Integração de partículas, locators e término ao sair de estados](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/particlesreference/particleentityintegration)
- [Simulação em espaço local](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/particlesreference/particlecomponents/minecraftemitter_local_space)
- [Attachables e contexto de equipamento](https://learn.microsoft.com/en-us/minecraft/creator/documents/attachables)
- [Materiais e transparência](https://learn.microsoft.com/en-us/minecraft/creator/documents/material-files)

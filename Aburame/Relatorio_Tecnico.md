# Reconstrução dos seis modos Aburame

## Problemas encontrados e solução

A base 18.11.68 usava modelos com 714–723 bones e 707–714 cubos. Dois modos venenosos reaproveitavam as malhas comuns, mudando principalmente a textura. Isso não distinguia uma colônia de besouros dos rinkaichū microscópicos de Torune.

Os seis modelos foram reconstruídos. Os modos comuns combinam besouros com corpo, cabeça, élitros articulados e recorte de pernas/antenas; grupos transparentes cruzados em várias profundidades representam organismos adicionais. Os modos venenosos têm revestimento fino adaptado às caixas humanas da addon, bordas em alfa e colônias de pontos microscópicos. Não alteram a geometria humana.

Há seis atlas diferentes de 512 × 512, além de seis flipbooks de partículas. As bordas dos agrupamentos terminam em pixels transparentes e deixam espaços entre organismos. As cores dos venenos são foscas e escuras; os materiais usam `entity_alphatest`, `entity_alphablend` e `particles_blend`, sem emissão luminosa.

Na revisão 18.11.71, os atlas dos enxames concentram besouros sobrepostos em núcleos com bordas vazadas. As faces cruzadas variam em tamanho, profundidade e inclinação. Nos venenosos, as manchas têm contraste mais baixo e a opacidade varia em cada região. As mãos recebem o violeta mais forte nos primeiros estágios. No último, a frente da cabeça usa uma área do atlas mais translúcida para que a pele apareça por baixo. [Comparativo dos seis modos](Comparativo_dos_Modos.md)

| Modo | Bones antes → agora | Cubos antes → agora | Organização |
| --- | ---: | ---: | --- |
| 1 | 714 → 62 | 707 → 98 | 16 besouros modelados e 6 grupos com profundidade |
| 2 | 714 → 18 | 707 → 14 | 2 revestimentos, 4 camadas de rastejo, 4 pequenos grupos |
| 3 | 714 → 78 | 707 → 130 | 20 besouros modelados e 10 grupos com profundidade |
| 4 | 714 → 25 | 707 → 25 | 3 revestimentos, 6 camadas de rastejo, 8 pequenos grupos |
| 5 | 723 → 118 | 714 → 210 | 30 besouros modelados e 20 grupos com profundidade |
| 6 | 723 → 38 | 714 → 42 | 6 revestimentos, 12 camadas de rastejo, 12 pequenos grupos |

O número de grupos não é a contagem de organismos: cada recorte contém vários insetos/pontos. A redução dos cubos vai de aproximadamente 70,6% a 98,0%. Não foi medido FPS; menos cubos não basta para garantir desempenho em todos os celulares, pois as transparências também têm custo.

## Renderização e encaixe

Cada modelo mestre usa os oito bones humanos com pivôs e pais da geometria nativa. As peças próprias ficam sob braços, corpo, cabeça ou pernas conforme a região. As animações Aburame só afetam bones exclusivos dos insetos; não substituem os canais de movimento do jogador.

Foram geradas 21 malhas derivadas: quatro por modo comum e três por modo venenoso. Cada malha tem no máximo 64 bones e preserva a cadeia de pais. Os subconjuntos dividem as peças por material sem desenhá-las duas vezes. A cena ativa apenas as três ou quatro camadas do modo equipado, em vez de desenhar os seis modelos simultaneamente.

Os dez attachables existentes, incluindo variantes específicas de jogador, mantêm identificadores e mapeamentos de item. Tornaram-se proxies vazios do slot da cabeça; o visual é renderizado pelo jogador. Isso permite usar o rig humano e evita que o mesmo enxame apareça também na mão ou envolva a câmera por causa de outro contexto de attachable.

As condições visuais reaproveitam os indicadores de primeira pessoa/UI da base e verificam somente o item do slot da cabeça. Todas as camadas e os estados de emissão respeitam essas condições. Há proteção extra de distância até 2,8 blocos, com entrada gradual até 3,0. Em câmeras muito próximas, os efeitos desaparecem intencionalmente.

## Movimento e partículas

Os besouros têm rastejo tangencial pequeno, voos de poucos centímetros e retorno, com fases e velocidades diferentes. Grupos comuns orbitam perto do corpo e respiram em escala discreta; o estágio 5 aumenta a distribuição lateral e inclui a região das pernas. Os modos venenosos mantêm o revestimento aderido ao corpo, com pontos em movimento sobre a superfície e pequenas oscilações de opacidade.

Os emissores usam locators novos nos dois rigs nativos e simulação em espaço local de posição/rotação. Nenhum comando ou entidade auxiliar coloca insetos em coordenadas do mundo. Os máximos configurados são 12, 12, 24, 24, 40 e 44 partículas por jogador nos modos 1–6. O controlador encerra o estado ao trocar/desequipar ou entrar em uma câmera oculta; cada partícula tem duração curta, no máximo 0,45 segundo. O comportamento final do descarte deve ser confirmado no motor.

## Preservação da addon

A integração usa a base aprovada 18.11.68, identificada por SHA-256. O pacote contém as versões 18.11.71 de BP e RP. A comparação confirma a integridade dos itens, atributos, níveis, proteção, multiplicadores, scripts de combate, seleção do clã e jutsus.

O sorteio e a tag `AburameRaro` não foram reescritos. A exigência explícita na primeira entrada venenosa do menu continua igual; os demais modos mantêm as verificações da base. Não foram acrescentadas novas condições de raridade.

Todos os recursos anteriores cujo caminho contém `iburi` são comparados byte a byte. No jogador e nas geometrias nativas, retirar somente os novos vínculos/locators Aburame deve reproduzir os arquivos aprovados. O item singular de jutsu `nz:inseto_aburame`, seus projéteis e texturas antigas permanecem intactos.

## Verificações realizadas e limites

- Integridade ZIP/CRC, entradas únicas, versões e dependências dos packs; igualdade dos arquivos preservados e assinatura do overlay.
- Schemas dos manifests, geometrias, animações, attachables, partículas e controladores novos/alterados.
- Hierarquia sem ciclos, UVs dentro do atlas, transparência das bordas, limites dos revestimentos e nomes exclusivos.
- Abertura, exportação e reabertura dos seis projetos no Blockbench 4.12.6, com textura embutida e uma animação por modelo. A comparação aceita apenas equivalências sem efeito: escala uniforme escalar/vetorial, rotação zero omitida e arredondamento numérico.
- Expressões Molang avaliadas para seis modos e slot vazio, várias condições de câmera, troca e remoção. A geometria é amostrada ao longo das animações para identificar valores inválidos e saídas dos limites visíveis.
- Exposição numérica das faces com alfa e rotações de bones, contra a geometria humana opaca com margem de roupa de 0,25 unidade. Os seis modos apresentam partes visíveis de frente, costas e lados; as duas famílias têm densidade progressiva. A cabeça permanece livre nos quatro primeiros modos e o revestimento final cobre a maior parte da superfície projetada.

**Minecraft não foi executado.** A análise ortográfica não inclui cabelo, acessórios, movimento humano, iluminação, ordenação real dos materiais nem partículas temporárias. Ainda precisam de teste no jogo: aparência com a skin do usuário, andar, correr, pular, agachar, girar, multiplayer, troca/remoção real de efeitos e desempenho em PC/celular. Os relatórios não atestam esses testes como concluídos.

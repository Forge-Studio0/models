# Clã Iburi — SWBR 18.11.68 · teste

Revisão dos três níveis após as imagens da 18.11.67. A mudança principal é colocar a fumaça **fora da pele opaca**, com progressão clara entre os estágios. A addon completa mantém os itens, UUIDs e sistemas da base fornecida.

- [Addon: Iburi.mcaddon](https://github.com/Forge-Studio0/models/raw/refs/heads/main/Iburi/Iburi.mcaddon)
- [Pacote completo: Iburi.zip](https://github.com/Forge-Studio0/models/raw/refs/heads/main/Iburi/Iburi.zip)
- [Somente integração](https://github.com/Forge-Studio0/models/raw/refs/heads/main/Iburi/Iburi_Integracao.zip)
- [Análise das imagens, mudanças e verificações](Revisao_18.11.68.md)

**Minecraft não foi executado neste ambiente.** Os arquivos, modelos no Blockbench, condições de câmera e exposição geométrica foram verificados. A aparência final no renderizador do jogo continua dependendo de confirmação no Minecraft.

## Os três níveis

| Modo | Identificador | Nível | Representação implementada |
| --- | --- | --- | --- |
| Fumaça I | `nz:modo_iburi1` | 10 | 13 volumes separados em ombros, antebraços, laterais e costas. Cabeça e pernas sem cobertura própria. |
| Fumaça II | `nz:modo_iburi2` | 15 | 29 volumes: mais fumaça nos braços, cobertura frontal do tronco e massas nas pernas. |
| Fumaça Total | `nz:modo_iburi3` | 25 | 50 volumes: cobertura mais densa à frente e atrás do tronco, nos membros, cabeça e pés. |

Os três mantêm a skin por baixo da fumaça. **Não foi reintroduzida a ocultação do corpo.** O terceiro nível utiliza cobertura densa como solução temporária, sem declarar concluída uma substituição integral da skin por fumaça.

As cores continuam cinza, com centros mais densos e bordas translúcidas. Cada atlas 512 × 512 tem 16 nuvens diferentes. Os volumes permanentes têm espessura e seis faces texturizadas; as camadas externas crescem, sobem e se dissipam. As partículas acompanham os bones corporais em espaço local.

## Mudanças da 18.11.68

- Nuvens e emissores deslocados para fora dos limites opacos do corpo. Na versão anterior, muitos estavam dentro dos braços, pernas ou cabeça.
- Geometria própria para cada camada: 21 malhas de renderização ao todo, com sete ativas por estágio. Não há reutilização de uma única malha com máscaras de partes diferentes.
- Nomes de bones de fumaça exclusivos por nível. O rig humano e seus pivôs continuam iguais aos da addon.
- Centros das nuvens mais largos e opacidade ajustada por estágio. A paleta foi clareada para reduzir o aspecto de mancha preta.
- A geometria chega à opacidade completa de distância em 3,0 blocos, em vez de 3,5. O corte de proteção em 2,8 blocos permanece.
- Nova verificação de exposição: faces das nuvens são comparadas com a geometria opaca do jogador de frente, costas e dos dois lados, em pose de base.

O nível 3 continua com 150 cubos. Cada malha de renderização tem até 58 bones; o modelo unificado do editor pode ter mais bones porque não é desenhado inteiro em uma única camada no jogo.

## Proteção da câmera

A fumaça continua controlada pelo **jogador**, usando os indicadores nativos do SWBR. Os itens da cabeça mantêm attachables vazios, sem malha corporal ou partículas na mão. Os arquivos dos ícones do inventário e da hotbar foram preservados.

**Toda a fumaça é desativada em primeira pessoa**, no inventário, no paperdoll, no ícone de mapa e para o personagem em modo espectador. Não foram adicionados comandos para girar a câmera, mudar perspectiva ou alterar FOV.

Há também um corte quando a distância entre a origem do jogador e a câmera é de até **2,8 blocos**. Entre **2,8 e 3,0**, a geometria entra gradualmente. Essa distância inclui a altura da câmera. Observadores muito próximos também terão a fumaça reduzida ou desativada.

## Instalação

1. Baixe `Iburi.mcaddon` e abra com Minecraft Bedrock. A versão mínima declarada pela base continua **1.26.10**.
2. Confirme que os packs ativos de **Recursos e Comportamento estão na versão 18.11.68**. Os UUIDs existentes foram mantidos. Desmaio Nativo 1.0.9 continua incluído.
3. Saia e reabra o mundo após atualizar os packs.
4. Use os modos no **slot da cabeça**, pelo menu normal do clã. Requisitos e níveis continuam ativos.

Para obter os itens em um mundo de teste com comandos habilitados:

```mcfunction
/give @s nz:modo_iburi1 1
/give @s nz:modo_iburi2 1
/give @s nz:modo_iburi3 1
```

## Integração e edição

`Iburi.zip` contém a addon, os três projetos `.bbmodel`, o ZIP de integração e os relatórios. Os projetos completos, com textura e animação, ficam em `Modelos_Blockbench/` e foram salvos e reabertos no Blockbench 4.12.6.

Os recursos estão em `Integracao/RP/` e `Integracao/BP/`. O arquivo `models/entity/swbr_iburi_draw.geo.json` contém as 21 geometrias usadas pelo renderizador. Os três arquivos tradicionais `nz_modo_iburiN` contêm os modelos unificados para edição. As camadas entregues correspondem exatamente aos cubos desses modelos; depois de editar um modelo unificado, as camadas correspondentes também precisam ser atualizadas.

Extraia `Iburi_Integracao.zip` e execute na pasta extraída:

```sh
python aplicar_integracao.py "SWBR_v18.11.64_GUI_VILA_CORRIGIDA.mcaddon" "Iburi_corrigido.mcaddon"
```

O aplicador também reconhece as entregas Iburi **18.11.65, 18.11.66 e 18.11.67** desta conversa. As quatro bases são identificadas por SHA-256. Uma entrada diferente é recusada para preservar alterações posteriores.

Na integração manual, copie **todo** o overlay. Isso inclui `player.entity.json`, os render controllers, o novo arquivo de malhas, as geometrias humanas com locators, attachables, texturas, animações e partículas. Atualizar apenas os PNGs não aplica esta revisão.

Itens, identificadores, slot, níveis 10/15/25, atributos, multiplicadores, jutsus, menus, híbridos e sistemas administrativos foram preservados. As geometrias humanas receberam somente locators exclusivos do Iburi; seus cubos, UVs e pivôs não foram alterados.

## Verificações

Os fontes ficam em `Fontes/`. Os relatórios `Validacao*.json` registram integridade dos arquivos, comparação com as quatro bases, schemas, referências, geometrias independentes, animações, proteção da câmera, limites de partículas, abertura no Blockbench e exposição das nuvens em relação à pele. As assinaturas vinculam os relatórios aos recursos atuais.

O teste `Fontes/validar_exposicao.py --baseline CAMINHO_PARA_IBURI_18.11.67.mcaddon` compara as versões sem gerar imagens. Ele utiliza a pose de base, uma margem de roupa de 0,25 unidade e projeções ortográficas. Não inclui cabelos adicionais, poses em movimento, o shader nem a ordenação real do Bedrock.

O helper do editor exige Playwright e uma cópia local do Blockbench servida em HTTP (`IBURI_BLOCKBENCH_URL`). O parser é configurável em `IBURI_MOLANG_MODULE`. Os programas de reconstrução não são necessários para instalar a addon pronta.

**Ainda precisam de confirmação no Minecraft:** aparência efetiva dos três níveis, movimento dos membros, visão de outro jogador, câmera perto de paredes, troca e desequipamento sem resíduos e desempenho no dispositivo. Não foram geradas prévias dos modelos.

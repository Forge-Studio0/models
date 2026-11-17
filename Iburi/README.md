# Clã Iburi — SWBR 18.11.67 · teste

Revisão dos três modos existentes após as capturas com fumaça cobrindo a visão. A addon completa continua baseada no SWBR fornecido, com os mesmos UUIDs, itens e sistemas.

- [Addon: Iburi.mcaddon](https://github.com/Forge-Studio0/models/raw/refs/heads/main/Iburi/Iburi.mcaddon)
- [Pacote completo: Iburi.zip](https://github.com/Forge-Studio0/models/raw/refs/heads/main/Iburi/Iburi.zip)
- [Somente arquivos de integração](https://github.com/Forge-Studio0/models/raw/refs/heads/main/Iburi/Iburi_Integracao.zip)
- [Revisão técnica e limites da verificação](Revisao_18.11.67.md)

**Minecraft não foi executado neste ambiente.** Foram verificados os arquivos, os modelos no Blockbench e as condições reais de câmera nos scripts com um parser Molang. Isso não comprova o resultado dentro do renderizador do jogo.

## Mudança principal

A fumaça agora pertence ao **jogador**. O item da cabeça mantém o vínculo de equipamento, com uma geometria vazia; ele não carrega uma malha de corpo nem gera partículas na mão. Os ícones do inventário e da hotbar foram preservados.

**Em primeira pessoa, toda a fumaça é desativada**, usando os mesmos indicadores nativos que o SWBR utiliza para desenhar o jogador. Inventário, paperdoll, ícone de mapa e espectador também não recebem fumaça. A condição anterior baseada em `context.is_first_person` do item foi retirada.

Existe ainda uma proteção por proximidade: a fumaça fica desativada a até **2,8 blocos da origem do personagem à câmera**, e sua geometria aparece gradualmente entre **2,8 e 3,5 blocos**. A medida inclui a altura da câmera. Isso protege também a câmera recolhida contra uma parede ou posicionada logo acima da cabeça. Observadores muito próximos também terão a fumaça reduzida ou desativada.

Em terceira pessoa, com distância suficiente, os três modos continuam com volumes e camadas animadas ao redor do corpo. As texturas ficaram mais claras e menos opacas. As partículas foram reduzidas e receberam limites de tamanho e proteção contra divisão por zero.

## Instalação

1. Baixe `Iburi.mcaddon` e abra com Minecraft Bedrock. A versão mínima declarada pela base continua **1.26.10**.
2. Confirme nos packs ativos que **Recursos e Comportamento estão na versão 18.11.67**. A importação atualiza os UUIDs existentes. O pack Desmaio Nativo 1.0.9 continua incluído e preservado.
3. Use o menu normal do clã. Os modos continuam equipáveis no **slot da cabeça**.

| Modo | Identificador | Nível | Composição |
| --- | --- | --- | --- |
| Fumaça I | `nz:modo_iburi1` | 10 | 13 volumes pequenos em ombros, antebraços, laterais e costas. |
| Fumaça II | `nz:modo_iburi2` | 15 | 26 volumes em braços, tronco e pernas. |
| Fumaça Total | `nz:modo_iburi3` | 25 | 50 volumes distribuídos pela cabeça, tronco e membros. |

**Fumaça Total mantém o corpo e o cabelo visíveis sob a cobertura.** A substituição completa da skin por fumaça continua adiada até confirmação real no jogo. Nenhum efeito novo de invisibilidade foi adicionado.

Para obter os itens em um mundo de teste com comandos habilitados:

```mcfunction
/give @s nz:modo_iburi1 1
/give @s nz:modo_iburi2 1
/give @s nz:modo_iburi3 1
```

## O que foi preservado

Itens, identificadores, slot da cabeça, níveis 10/15/25, requisitos, multiplicadores, atributos, física, menus, jutsu `nz:jutsu_iburi_fumaca`, híbridos e sistemas administrativos permanecem preservados.

Não foram adicionados comandos para girar a câmera, mudar a perspectiva ou alterar FOV. A revisão atua na renderização da fumaça. Os scripts de câmera existentes no Behavior Pack permanecem iguais.

As adições em `player.entity.json` têm nomes exclusivos do Iburi. As instruções e vínculos anteriores foram preservados, exceto os três comandos de ocultação Iburi da 18.11.65, que continuam removidos. Duas geometrias humanas existentes receberam somente locators com nomes exclusivos, sem alterações de cubos, pivôs, UVs ou hierarquia.

## Arquivos editáveis e integração

`Iburi.zip` reúne a addon, os três projetos e o ZIP de integração. Os projetos estão em:

- `Modelos_Blockbench/Iburi_Fumaca_I.bbmodel`
- `Modelos_Blockbench/Iburi_Fumaca_II.bbmodel`
- `Modelos_Blockbench/Iburi_Fumaca_Total.bbmodel`

Cada projeto inclui textura e animação e foi salvo e reaberto no Blockbench 4.12.6. Os recursos do jogo ficam em `Integracao/RP/`; a versão do Behavior Pack e os nomes Iburi ficam em `Integracao/BP/`. Não foram geradas prévias de modelos.

Para integrar à base original, extraia `Iburi_Integracao.zip` e execute na pasta extraída:

```sh
python aplicar_integracao.py "SWBR_v18.11.64_GUI_VILA_CORRIGIDA.mcaddon" "Iburi_corrigido.mcaddon"
```

O aplicador também reconhece os arquivos Iburi **18.11.65 e 18.11.66** desta conversa. As três entradas são verificadas por SHA-256 no manifesto. Ele preserva a entrada, substitui somente os arquivos do overlay e recusa bases diferentes.

Ao integrar manualmente, inclua **todos** os arquivos do overlay, especialmente `entity/player.entity.json`, as geometrias em `models/entity/swbr39/`, os attachables vazios e o controlador de partículas. Copiar somente as texturas não aplica a correção da câmera.

O arquivo legado `models/entity/nz_modo_iburi3l.geo.json` foi mantido para substituir a geometria anterior sem criar um identificador duplicado. Os três identificadores de modo permanecem os mesmos.

## Fontes e verificação

Os fontes ficam em `Fontes/`. Para reconstruir:

```sh
python -m pip install -r Fontes/requirements.txt
python Fontes/construir_iburi.py "Iburi_18.11.66.mcaddon" --compatible-base "SWBR_v18.11.64_GUI_VILA_CORRIGIDA.mcaddon" --compatible-base "Iburi_18.11.65.mcaddon"
node Fontes/exportar_blockbench.cjs
node Fontes/validar_molang.cjs
python Fontes/aplicar_integracao.py "Iburi_18.11.66.mcaddon" "Iburi.mcaddon"
python Fontes/validar_iburi.py "Iburi_18.11.66.mcaddon" "Iburi.mcaddon"
```

O helper do Blockbench exige Playwright e uma cópia local do editor servida em HTTP (`IBURI_BLOCKBENCH_URL`). O parser é configurável em `IBURI_MOLANG_MODULE`. Esses programas não são necessários para instalar a addon pronta.

Os relatórios incluem comparação com as três bases, integridade ZIP/CRC, schemas, referências, máscaras com ancestrais, hierarquia, texturas, condições de câmera, dimensões das partículas e reabertura dos projetos. As assinaturas dos fontes ligam os relatórios aos arquivos realmente entregues.

**Ainda precisam de confirmação dentro do Minecraft:** visão livre nos três modos em primeira pessoa; aparência de frente, costas e lados em terceira pessoa; caminhada, corrida, salto e agachamento; câmera perto de paredes; observação por outro jogador; troca e desequipamento sem resíduos. O teste numérico não foi apresentado como teste do jogo.

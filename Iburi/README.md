# Clã Iburi — SWBR 18.11.66 · versão de teste

Correção dos três modos existentes, a partir do Iburi 18.11.65 que apresentou falhas nas capturas do Minecraft enviadas pelo usuário. **Iburi.zip** reúne a addon completa, os três modelos editáveis e os arquivos para integração. Não foram geradas prévias.

- [Addon completa: Iburi.mcaddon](https://github.com/Forge-Studio0/models/raw/refs/heads/main/Iburi/Iburi.mcaddon)
- [Pacote completo: Iburi.zip](https://github.com/Forge-Studio0/models/raw/refs/heads/main/Iburi/Iburi.zip)
- [Arquivos para integração](https://github.com/Forge-Studio0/models/raw/refs/heads/main/Iburi/Iburi_Integracao.zip)

**Minecraft não está disponível neste ambiente.** Os arquivos foram verificados e os projetos foram abertos, salvos e reabertos no Blockbench. A renderização efetiva no Bedrock e o comportamento durante movimento e desequipamento precisam de teste no jogo.

## Instalação

1. Baixe `Iburi.mcaddon` e abra com Minecraft Bedrock. A versão mínima declarada pela base continua **1.26.10**.
2. Confirme que os packs de Recursos e Comportamento ativos estão na versão **18.11.66**. Os UUIDs foram mantidos para atualizar os packs existentes. O pack Desmaio Nativo 1.0.9 foi preservado.
3. Utilize o menu normal do clã e equipe o modo no **slot da cabeça**. Os níveis e requisitos continuam ativos.

Para conferir em um mundo de teste com comandos habilitados:

```mcfunction
/give @s nz:modo_iburi1 1
/give @s nz:modo_iburi2 1
/give @s nz:modo_iburi3 1
```

| Modo | Identificador | Nível | Correção visual implementada |
| --- | --- | --- | --- |
| Fumaça I | `nz:modo_iburi1` | 10 | 13 pequenos volumes em ombros, antebraços, laterais e costas; corpo preservado. |
| Fumaça II | `nz:modo_iburi2` | 15 | 26 volumes em braços, tronco e pernas, com camadas que sobem, crescem e desaparecem. |
| Fumaça Total | `nz:modo_iburi3` | 25 | 50 volumes distribuídos pela cabeça, tronco, braços e pernas, com cobertura mais densa. |

**Solução temporária para Fumaça Total:** os três comandos de ocultação visual adicionados na 18.11.65 foram removidos. O corpo e o cabelo permanecem sob a fumaça. Esta entrega não afirma que a substituição completa da skin por fumaça foi concluída ou comprovada no jogo. Não há novo efeito de invisibilidade.

## O que foi corrigido

- As máscaras anteriores começavam com `"*": false`, desativando também os ancestrais das nuvens. Agora o rig permanece habilitado e cada passe seleciona explicitamente apenas seus volumes. A validação verifica a cadeia inteira de pais, em vez de conferir somente o nome da nuvem.
- Cada massa tem um volume com espessura e textura nas seis faces, além de duas camadas cruzadas de dissipação. O volume central permanece visível durante todo o ciclo; as camadas externas mudam de tamanho, posição e opacidade.
- As texturas 512 × 512 têm 16 nuvens diferentes por modo, somente em cinza, com centros mais densos e bordas de alfa zero. Não foram utilizados fundos azuis ou sprites retangulares preenchidos.
- O esqueleto agora corresponde ao `geometry.swbr39.custom` da própria addon, incluindo raiz, pivôs e hierarquia das pernas. As animações próprias atuam apenas nos filhos de fumaça.
- As partículas deixaram a linha do tempo com `bind_to_actor: false`. Elas são iniciadas por estados de um controlador exclusivo do Iburi, usando o vínculo padrão ao ator e simulação em espaço local de posição e rotação. Os locators acompanham os bones corporais.
- Sair do estado equipado encerra os emissores, conforme o mecanismo nativo dos controladores Bedrock. As partículas têm vida de no máximo 0,55 s e limites por jogador de 18, 32 e 36, respectivamente. A remoção visual efetiva, inclusive possíveis resíduos breves, ainda precisa ser confirmada no jogo.

Há sete passes por modo: um para os volumes centrais e seis para a dissipação. O terceiro estágio mantém 150 cubos, a mesma quantidade total da implementação anterior. Não há entidades auxiliares nem emissão por scripts em coordenadas fixas do mundo.

## Sistemas preservados

Os itens, identificadores, slot da cabeça, níveis 10/15/25, multiplicadores, atributos, requisitos, jutsu `nz:jutsu_iburi_fumaca`, menus, híbridos e sistemas administrativos permanecem preservados. O Behavior Pack não recebeu alterações de lógica nesta correção; sua versão foi atualizada.

Em `player.entity.json`, somente as três instruções Iburi de ocultação da 18.11.65 foram removidas. O restante desse arquivo permanece igual. Também foi conferida a preservação dos arquivos fora do escopo em relação à base original 18.11.64.

## Integração à addon existente

Extraia `Iburi_Integracao.zip` e execute na pasta extraída:

```sh
python aplicar_integracao.py "SWBR_v18.11.64_GUI_VILA_CORRIGIDA.mcaddon" "Iburi_corrigido.mcaddon"
```

O aplicador também aceita o `Iburi.mcaddon` da versão **18.11.65** desta conversa como entrada. As duas bases são reconhecidas pelas assinaturas SHA-256 registradas em `Integracao_Manifesto.json`. Uma base diferente é recusada para evitar sobrescrever alterações posteriores.

O aplicador usa apenas a biblioteca padrão do Python, preserva a entrada e copia os arquivos fora do escopo sem alterar seu conteúdo. Os diretórios `Integracao/BP/` e `Integracao/RP/` contêm os arquivos necessários para uma árvore de desenvolvimento extraída. **Inclua `entity/player.entity.json` ao atualizar a 18.11.65**, pois ele remove o ocultamento que causou o desaparecimento do corpo.

O nome legado `models/entity/nz_modo_iburi3l.geo.json` foi mantido para substituir o arquivo anterior sem duplicar o identificador da geometria.

## Arquivos editáveis

- `Modelos_Blockbench/Iburi_Fumaca_I.bbmodel`
- `Modelos_Blockbench/Iburi_Fumaca_II.bbmodel`
- `Modelos_Blockbench/Iburi_Fumaca_Total.bbmodel`

Os três projetos incluem textura e animação e foram reabertos no Blockbench 4.12.6 sem erros registrados. Geometrias, PNGs, animações, controladores, partículas e attachables ficam em `Integracao/RP/`. Os fontes de geração e verificação ficam em `Fontes/`.

Para reconstruir a partir da implementação anterior e registrar também a compatibilidade com a base original:

```sh
python -m pip install -r Fontes/requirements.txt
python Fontes/construir_iburi.py "Iburi_18.11.65.mcaddon" --compatible-base "SWBR_v18.11.64_GUI_VILA_CORRIGIDA.mcaddon"
node Fontes/exportar_blockbench.cjs
node Fontes/validar_molang.cjs
python Fontes/aplicar_integracao.py "Iburi_18.11.65.mcaddon" "Iburi.mcaddon"
python Fontes/validar_iburi.py "Iburi_18.11.65.mcaddon" "Iburi.mcaddon"
```

O helper do Blockbench exige Playwright e uma cópia local do editor servida por HTTP (`IBURI_BLOCKBENCH_URL`). O verificador Molang usa o parser do editor, configurável em `IBURI_MOLANG_MODULE`. Os `.bbmodel` prontos dispensam esses programas para instalação no jogo.

## Verificações e limites

`Validacao.json` registra integridade ZIP/CRC, schemas, referências, hierarquia, máscaras com ancestrais, volumes, texturas, controle de emissores e comparação de arquivos com a 18.11.65. `Validacao_Base_18.11.64.json` registra a auditoria contra a base original. `Validacao_Blockbench.json` registra importação, exportação e reabertura dos projetos. `Validacao_Molang.json` registra os ciclos e as condições de entrada e saída dos emissores.

A conferência dentro do Minecraft ainda deve verificar os três modos de frente, costas e lados; caminhada, corrida, salto e agachamento; troca entre os três itens; desequipamento e retorno da aparência normal; ausência de retângulos ou partículas deixadas no mundo. Esses comportamentos não foram marcados como aprovados por um teste real do jogo.

Referências artísticas usadas na implementação anterior: `Referencias.md`. Referências técnicas desta correção:

- [Integração de partículas e término ao sair de estados](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/particlesreference/particleentityintegration)
- [Simulação de partículas em espaço local](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/particlesreference/particlecomponents/minecraftemitter_local_space)
- [Eventos de partículas e vínculo padrão ao ator](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/visualreference/actor_animation_controller.v1.10.0)

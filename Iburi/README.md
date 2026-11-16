# Clã Iburi — Shinobi World BR 18.11.65

Reformulação visual dos três modos Iburi, sobre a base **SWBR_v18.11.64_GUI_VILA_CORRIGIDA.mcaddon** fornecida. O arquivo **Iburi.zip** reúne a addon completa e os arquivos de integração. A addon também está disponível separadamente em **Iburi.mcaddon**. Os arquivos alterados para integração estão em **Iburi_Integracao.zip** e na pasta **Integracao/**.

## Instalar a addon completa

1. Baixe `Iburi.mcaddon` e abra-o com o Minecraft Bedrock, compatível com a versão mínima da base: **1.26.10**.
2. Confirme a atualização dos packs de Comportamento e Recursos para **18.11.65**. Seus UUIDs foram mantidos. O pack Desmaio Nativo 1.0.9 também foi preservado.
3. Ative os packs no mundo que utiliza o sistema Shinobi World BR.
4. Desbloqueie os modos pelo menu normal do clã. Para conferência em um mundo de teste com comandos habilitados:

```mcfunction
/give @s nz:modo_iburi1 1
/give @s nz:modo_iburi2 1
/give @s nz:modo_iburi3 1
```

Equipe os itens no **slot da cabeça**, como na base original. Os requisitos de desbloqueio continuam ativos; os comandos não substituem o fluxo normal do menu.

| Modo | Identificador | Nível | Representação |
| --- | --- | --- | --- |
| Fumaça I | `nz:modo_iburi1` | 10 | Pequenas massas nos ombros, antebraços e escápulas; corpo e skin continuam visíveis. |
| Fumaça II | `nz:modo_iburi2` | 15 | Camadas nos braços, flancos e pernas, com emissão de partículas. A skin sob a fumaça continua opaca; a dissolução parcial é uma composição visual. |
| Fumaça Total | `nz:modo_iburi3` | 25 | Nuvens em diferentes profundidades formam uma silhueta humana difusa. O controle de renderização já existente na addon é ativado somente para esse item, ocultando o corpo base e o cabelo. |

Não foi aplicada invisibilidade por efeito de jogo. A ocultação visual do modo 3 não muda física, colisão, dano ou atributos. Nenhum corpo humano foi feito de blocos opacos: as massas usam peças finas em três ângulos, com texturas alfa de bordas suaves.

## Animações e integração

Cada modo tem sua própria animação `animation.nz_modo_iburiN.idle`. Os ciclos usam seis fases de opacidade, subida e expansão, com oscilação individual das nuvens. As partículas se desprendem dos braços, ombros e, nos estágios maiores, pernas, tronco e cabeça. A progressão aumenta a quantidade de fumaça, mantendo a forma vertical do personagem.

Os bones `body`, `head`, `rightArm`, `leftArm`, `rightLeg` e `leftLeg` acompanham o rig do jogador; as animações próprias atuam somente nos bones das nuvens. A antiga animação inexistente do modo 2 foi criada, a grafia `iburu3` foi corrigida e o modo 3 deixou de usar a animação do Aburame e o controlador genérico compartilhado.

O arquivo compartilhado `player.entity.json` recebe somente três instruções no fim de `pre_animation`: verificar se `nz:modo_iburi3` está equipado e combinar essa condição com os dois controles visuais existentes. As instruções originais e os render controllers permanecem intactos. Fora desse modo, os controles mantêm seus valores originais a cada quadro.

Os três itens de modo, os níveis 10/15/25, os requisitos, os atributos, os multiplicadores e o jutsu `nz:jutsu_iburi_fumaca` foram preservados. No registro de combate, apenas os três nomes de apresentação foram atualizados para Fumaça I, Fumaça II e Fumaça Total. Os nomes desses itens também foram corrigidos nas cinco localizações já presentes, preservando todas as demais entradas.

## Adicionar os arquivos à base original

Extraia `Iburi_Integracao.zip` e execute, na pasta extraída:

```sh
python aplicar_integracao.py "SWBR_v18.11.64_GUI_VILA_CORRIGIDA.mcaddon" "Iburi.mcaddon"
```

Esse aplicador usa apenas a biblioteca padrão do Python. Ele verifica a assinatura SHA-256 da base, substitui somente os arquivos listados em `Integracao_Manifesto.json`, adiciona os novos recursos e preserva os demais arquivos. Use a base original enviada nesta conversa. O aplicador rejeita uma addon diferente para evitar sobrescrever alterações posteriores.

Em uma árvore de desenvolvimento já extraída, `Integracao/BP/` e `Integracao/RP/` são os arquivos que devem substituir ou complementar os packs correspondentes. O nome legado `models/entity/nz_modo_iburi3l.geo.json` foi mantido para substituir a geometria antiga sem deixar um segundo arquivo com o mesmo identificador.

## Arquivos editáveis

- `Modelos_Blockbench/Iburi_Fumaca_I.bbmodel`
- `Modelos_Blockbench/Iburi_Fumaca_II.bbmodel`
- `Modelos_Blockbench/Iburi_Fumaca_Total.bbmodel`

Os projetos incluem textura e animação. Abra-os diretamente no Blockbench. As geometrias, PNGs, animações, partículas e attachables do jogo estão em `Integracao/RP/`. Cada atlas tem 16 nuvens diferentes em cinza, com densidade central e transparência gradual. Não foram geradas prévias dos modelos.

Para reconstruir o overlay a partir dos fontes:

```sh
python -m pip install -r Fontes/requirements.txt
python Fontes/construir_iburi.py "SWBR_v18.11.64_GUI_VILA_CORRIGIDA.mcaddon"
python Fontes/aplicar_integracao.py "SWBR_v18.11.64_GUI_VILA_CORRIGIDA.mcaddon" "Iburi.mcaddon"
python Fontes/validar_iburi.py "SWBR_v18.11.64_GUI_VILA_CORRIGIDA.mcaddon" "Iburi.mcaddon"
```

Se modificar o gerador ou as pinturas, exporte os modelos novamente no Blockbench e refaça as verificações antes de empacotar. `Fontes/validar_molang.cjs` usa o parser Molang do editor; o caminho desse módulo pode ser definido por `IBURI_MOLANG_MODULE`.

Os `.bbmodel` entregues foram importados e salvos pelo Blockbench 4.12.6. O helper opcional `Fontes/exportar_blockbench.cjs` faz essa etapa com Playwright e uma cópia local do editor servida em HTTP; ele não produz capturas de tela.

## Verificação

`Validacao.json` registra a comparação de arquivos com a base, a preservação dos itens e sistemas, a estrutura do `.mcaddon`, os JSONs, schemas, referências, bones, locators, materiais, texturas e os ciclos Molang. `Validacao_Blockbench.json` registra a abertura dos três projetos com animações e sem erros.

**Minecraft Bedrock não foi executado neste ambiente.** A importação no jogo, a renderização efetiva, a ocultação do corpo no modo 3, as partículas e o encaixe ao andar, correr, pular e agachar precisam de confirmação no jogo. Os modelos foram preparados para essas poses pela hierarquia do rig; isso não equivale a um teste dentro do Minecraft.

As referências analisadas e o limite de acesso ao vídeo estão em `Referencias.md`.

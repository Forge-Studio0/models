# Shinobi World BR 18.11.83 · Correção de desmaio

Esta edição usa o cumulativo Chinoike **18.11.82** como base. Importe o `.mcaddon` e confira no mundo o BP e o RP **18.11.83** e o BP **Desmaio Nativo 1.0.10**. [Baixar SWBR_18.11.83_Cumulativo.mcaddon](https://raw.githubusercontent.com/Forge-Studio0/models/main/Desmaio/SWBR_18.11.83_Cumulativo.mcaddon)

## Causa e correção

Na 18.11.82, falhar na abertura do mínimo zero ou ficar sem confirmação de morte chamava `enterDowned` outra vez, com pelo menos cinco segundos novos. Isso criava novas tentativas sem fim. Entre remover a tag de desmaio e confirmar a morte, ainda era possível que o ajuste de vida virtual ou a regeneração escrevessem HP. O evento nativo também tentava adicionar o mesmo grupo de vida sem reinstalá-lo explicitamente.

Agora uma finalização concluída ou um prazo vencido registra a morte definitiva antes de limpar as ações presas ao corpo. O sistema abre o mínimo zero e tenta `Entity.kill()` uma vez. Se o jogador ainda estiver vivo e o motor não confirmar a morte, há uma tentativa de zerar a vida diretamente. O fluxo conclui pela confirmação de `entityDie` ou `playerSpawn`. Se o motor recusar ambos os caminhos e o jogador continuar vivo, a tentativa termina com os controles restaurados e um diagnóstico registrado.

O prazo continua em dois minutos, com pausa durante transporte. Ao soltar ou perder o carregador, volta a contar o tempo restante. Fora do transporte, o vencimento persistido inclui o período offline. Uma tentativa de morte interrompida é reconciliada ao reconectar. A geração do corpo e as reservas existentes cancelam ações antigas de dano, reviver e finalização.

O Bedrock processa o respawn. A rotina de vilas só aplica o teleporte do reaparecimento mais recente e conserva a configuração dos pontos de vila. O desmaio restaura a vida e os controles após o reaparecimento.

## Arquivos alterados

| Pack e arquivo | Alteração |
| --- | --- |
| BP `scripts/rp_v170_downed.js` | Confirmação idempotente, persistência, limpeza e retomada de morte autorizada. |
| BP `scripts/rp_v18719_downed_bridge.js` | Validação da geração do corpo e rejeição de comandos de morte duplicados. |
| BP `scripts/rp_v131_safe_health.js` | A correção de HP respeita o desmaio, a morte definitiva e a geração original do dano. |
| BP `scripts/rp_v17091_health_regen.js` e `scripts/rp_v1840_common.js` | Os pontos ativos de recuperação respeitam a morte definitiva. |
| BP `scripts/rp_v17028_weekly_admin.js` | Invalida teleportes atrasados de uma reaparição anterior e preserva a configuração de vila. |
| BP `scripts/rp_v18368_death_audit.js` | Descarta registros preparados quando o motor recusa a morte. |
| BP `entities/player.json` | O evento `swbr:floor_allow_death30` reinstala explicitamente o grupo de mínimo zero. |
| Desmaio Nativo `scripts/main.js` | O sinal nativo deixa passar o dano definitivo e interrompe a cura nessa janela. |
| BP, RP e Desmaio Nativo `manifest.json` | Atualiza a versão e as dependências entre packs. As versões de API permanecem 1.19.0 no BP principal e 2.6.0 no serviço nativo. |

O empacotamento validou a integridade dos três packs e comparou byte a byte 2.983 arquivos do BP e 8.048 do RP, incluindo todos os modelos e texturas. Os scripts corrigidos estão nesta pasta do repositório.

## Testes

Os 21 testes automatizados passaram. O simulador carrega os scripts dos dois `.mcaddon`, reproduz o ciclo da 18.11.82 e avalia a 18.11.83 em expiração, finalização, reviver, transporte entre dimensões, retomada após desconexão ou reinício e cinco ciclos consecutivos. O teste de respawn também exercita o script de vila original com as novas verificações.

A confirmação no jogo, incluindo camas, âncoras, transporte entre dimensões e a resposta nativa aos eventos de morte, segue pendente. O motor Bedrock estava indisponível neste ambiente. [Roteiro de teste](Testes/Bedrock.md)

```sh
python Desmaio/empacotar.py
node --experimental-vm-modules --test Desmaio/Testes/desmaio.test.mjs
```

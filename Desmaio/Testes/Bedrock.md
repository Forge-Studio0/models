# Roteiro de teste no Minecraft Bedrock

Use uma cópia do mundo cumulativo, dois ou três jogadores em sobrevivência e os três packs da 18.11.83. O BP principal usa `@minecraft/server` 1.19.0, e o Desmaio Nativo 1.0.10 usa a 2.6.0. Confirme que o serviço aparece ativo com `/scriptevent swbr:desmaio_status` e que o evento de dano do motor responde com `/scriptevent swbr:desmaio_verificar`.

O comando `/scriptevent swbr:corpo_diagnostico` mostra o estado do corpo, o prazo restante, o mínimo de vida, as ações ativas e os eventos recentes. Use o registro para conferir se aparecem `downed_enter`, `death_commit`, a confirmação da morte e `native_respawn`, conforme o cenário. A rotina registra transições em um histórico limitado.

| Cenário | Ação no mundo | Resultado esperado |
| --- | --- | --- |
| 1. Entrada | Aplique dano letal a um personagem elegível. | Um desmaio, com controles bloqueados e contagem de 120 s. |
| 2. Reviver | A até três blocos, use `!reviver Nome` e aguarde dez segundos parado. Repita com um terceiro jogador tentando reviver ao mesmo tempo. | Uma única operação conclui, com 10% de vida nativa e controles liberados. A espera de dois minutos depois do reviver termina com o jogador vivo. |
| 3. Vencimento | Cause novo desmaio e espere os 120 s com o corpo solto. | Uma morte definitiva, seguida do respawn do Bedrock. O cronômetro desaparece. |
| 4. Finalização | Agache e ataque o desmaiado ou use `!finalizar Nome`. Confirme dentro do alcance e fique voltado ao alvo durante os 0,8 s da ação. Repita como o próprio carregador. | Uma morte definitiva. O transporte e as duas reservas de ação são liberados. |
| 5. Dano após recuperação | Após reviver e após reaparecer, aplique dano comum e depois dano letal. | O dano comum reduz a vida. O próximo dano letal elegível pode iniciar um novo desmaio. |
| 6. Respawn | Teste o spawn padrão, cama, âncora e vila configurada. Use um personagem sem vila configurada para os pontos nativos. | O Bedrock resolve os pontos nativos. A vila configurada segue a prioridade do servidor e aplica seu destino uma vez. |
| 7. Danos repetidos | Aplique vários golpes consecutivos na entrada e durante o desmaio. | Um desmaio, com um único prazo. |
| 8. Limite do prazo | Inicie o reviver com cerca de dez segundos restantes. Repita com a finalização iniciada perto do vencimento. | Uma transição. Ao vencer o prazo, a morte automática tem prioridade sobre uma ação incompleta. |
| 9. Desconexão | Retorne antes do prazo em uma tentativa e depois do prazo em outra. Repita desconectando durante a finalização. | A primeira tentativa retoma o tempo restante. A segunda conclui a morte quando o jogador volta. Uma morte já confirmada termina no respawn. |
| 10. Transporte | Use `!carregar Nome`, aguarde mais de dois minutos e use `!soltar` ou agache e pule. Repita desconectando o carregador. Teste Hiraishin com uma marca já disponível. | O prazo pausa no transporte e retoma ao soltar ou perder o carregador. O assento e os efeitos do carregador são liberados. |
| 11. Ciclos | Repita cinco vezes, alternando reviver e morte definitiva. | Cada ciclo termina uma vez. O próximo corpo recebe dano e mantém os próprios estados. |
| 12. Reinício | Pare e reinicie o servidor com um desmaiado solto. Repita com alguém sendo carregado no momento da parada. | O prazo fora do transporte considera o período offline. Um transporte órfão é limpo e volta a contar a partir do tempo que restava. |

Para cada falha, registre a versão do Bedrock, o diagnóstico do corpo, o tipo de dano, o destino de respawn esperado e se o Content Log mostra `death_failed`. O ambiente de edição executou a simulação dos scripts, e este roteiro aguarda execução no motor Bedrock.

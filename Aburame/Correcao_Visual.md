# Diagnóstico visual do Aburame — 18.11.72

As capturas mostram besouros azulados flutuando à frente do jogador, enxames escuros pouco legíveis e falhas retangulares nas áreas violetas. Os três efeitos usam caminhos diferentes no pacote.

| Efeito | O que foi conferido | Correção |
| --- | --- | --- |
| Besouros azuis grandes | O sensor `swbr:track_insect32` gerava cinco sprites azulados ao redor do jogador mesmo enquanto procurava um alvo. | Com um alvo válido, o sensor desenha cinco marcadores pequenos e escuros no caminho até ele. O alcance, a busca e o HUD continuam no sistema de rastreio. |
| Enxames pretos discretos demais | A textura já tinha muitos insetos, mas os detalhes muito finos perdiam contraste à distância. As faces se misturavam por transparência. | Os grupos têm núcleos opacos, bordas vazadas e distribuição em várias profundidades. A presença aumenta dos punhos e antebraços para os ombros, laterais e pernas. |
| Retângulos no revestimento violeta | A máscara anterior cobria o torso no PNG. O corpo e a sobreposição violeta tinham geometrias separadas, sujeitas a diferenças de oclusão e ordenação. As imagens não identificam o renderizador ou a combinação de camadas usada na sessão. | O controlador seleciona a versão tingida da textura SWBR na mesma malha e com os mesmos UVs do corpo. As mãos, os braços e o corpo ganham cobertura progressiva. A textura preserva os recortes, a linha escura do rosto e parte do relevo da pele. |

Também foram conferidos os vínculos dos seis itens, a seleção do slot da cabeça, os controladores duplicados, o corte perto da câmera e a troca entre estágios. Os seis modos selecionam os recursos pelo item equipado. As peles do seletor SWBR usam a textura tingida em terceira pessoa mesmo de perto. As skins externas usam a sobreposição de compatibilidade por não estarem em arquivos PNG dentro da addon.

O rastreio foi verificado com e sem alvo, após desequipar o item e com alvo em outra dimensão ou fora do alcance. Os testes usam os JSONs e o script do pacote, além da exportação dos seis modelos no Blockbench. A aparência da 18.11.72 ainda precisa de confirmação no Minecraft, especialmente com skins externas, roupas ou outros packs ativos. [Relatório técnico](Relatorio_Tecnico.md)

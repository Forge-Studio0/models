# Fontes e reprodução

Python 3.11+ e as bibliotecas de `requirements.txt` são usados na construção e nos validadores. A aplicação do overlay pronto usa somente a biblioteca padrão do Python.

```sh
python -m pip install -r Fontes/requirements.txt
python Fontes/construir_aburame.py "caminho/SWBR_18.11.68_IBURI.mcaddon"
python Fontes/validar_visual.py
python Fontes/aplicar_integracao.py "caminho/SWBR_18.11.68_IBURI.mcaddon" "Aburame.mcaddon"
```

Os scripts resolvem os recursos a partir da pasta do clã; execute os comandos dessa pasta. O gerador foi feito para a base 18.11.68 com o Iburi aprovado, não para aplicar alterações automaticamente a qualquer versão.

## Blockbench e Molang

Para repetir o teste do editor, instale as dependências Node com `npm install --prefix Fontes` e disponibilize localmente o aplicativo web do **Blockbench 4.12.6**. Defina `ABURAME_BLOCKBENCH_URL` para seu endereço HTTP local; o padrão é `http://127.0.0.1:8876/`. O Playwright precisa de Chromium (`npx playwright install chromium`, a partir de Fontes), ou de `/usr/bin/chromium`.

```sh
node Fontes/exportar_blockbench.cjs
```

O script abre os recursos nativos, compara as exportações e salva/reabre os seis `.bbmodel`, com texturas e animações embutidas. Não produz screenshots. A geometria humana de referência não é copiada para dentro dos modelos de insetos.

Para uma revisão restrita ao primeiro modo, `ABURAME_MODES=1` limita a exportação a ele e mantém os projetos/relatórios anteriores dos demais; o validador principal confere suas assinaturas atuais. O argumento opcional `--anterior caminho/Aburame_18.11.69.mcaddon` no validador confere que os recursos específicos dos modos 2–6, o rastreio e os demais sistemas não mudaram nesta revisão.

O teste numérico usa o parser Molang distribuído com essa versão do Blockbench. Defina `ABURAME_MOLANG_MODULE` para o caminho absoluto de `lib/molang.umd.js` no código do Blockbench e execute:

```sh
node Fontes/validar_molang.cjs
python Fontes/validar_aburame.py "caminho/SWBR_18.11.68_IBURI.mcaddon" "Aburame.mcaddon"
python Fontes/empacotar_aburame.py
```

Depois de qualquer alteração nos recursos nativos, repita as exportações e verificações antes de empacotar. Os relatórios guardam assinaturas dos arquivos usados; o validador rejeita relatórios desatualizados. Os testes são estáticos/editor e não substituem Minecraft.

## Arquivos

- `construir_aburame.py`: gera os seis modelos mestres, atlas, animações, partículas, subdivisões de renderização e overlay do jogador.
- `exportar_blockbench.cjs`: confere o ciclo de edição e exporta os projetos.
- `validar_molang.cjs`: testa expressões de câmera, estados e limites numéricos de geometria/partículas.
- `validar_visual.py`: mede exposição e progressão de densidade em quatro direções, sem gerar imagens.
- `validar_aburame.py`: audita o `.mcaddon` e a preservação da base.
- `aplicar_integracao.py`: aplica o overlay com conferência de SHA-256.
- `empacotar_aburame.py`: monta os dois ZIPs e as assinaturas de entrega.
- `Schemas/`: schemas de validação com sua licença preservada em `LICENSE.txt`.

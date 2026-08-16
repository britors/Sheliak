# Sheliak

Sheliak é o dock do Lyra OS para o GNOME Shell. A versão 1 oferece favoritos,
aplicativos em execução, menus por aplicativo, lixeira dinâmica e acesso à
grade nativa de aplicativos. O dock fica centralizado na borda esquerda e usa
ocultação inteligente quando uma janela ocupa sua área.

A extensão também permite ajustar a altura da barra superior e ocultar o relógio
ou os indicadores nativos à direita. Ela oferece menus opcionais de
**Aplicativos**, **Locais**, **Rede**, **Sistema** e **Busca** nessa barra: Aplicativos são
organizados por categoria; Locais reúne pastas pessoais, marcadores do
gerenciador de arquivos e volumes montados; Rede mostra o estado da conexão,
permite ativar ou desativar a rede e o Wi-Fi e abre as configurações; Sistema
oferece acesso ao código
fonte, ao relatório de problemas, ao Vega, às informações do sistema e às ações
de energia; e Busca encontra aplicativos e configurações. No menu Sistema,
**Sobre** aparece imediatamente antes de **Desligar**, que reúne as ações
Suspender, Reiniciar, Desligar e Encerrar sessão.

Cada menu, sua posição e seus conteúdos dinâmicos podem ser configurados na
página Barra superior das preferências. A mesma página permite ocultar o botão
nativo de áreas de trabalho, ordenar categorias e aplicativos alfabeticamente
e abrir os submenus de categorias lateralmente.

Ao minimizar ou restaurar uma janela, o Sheliak oferece animações de zoom ao
ícone e desvanecimento, além da opção sem animação. Os efeitos que usam o item
correspondente no dock como destino acompanham o dock nas bordas inferior,
esquerda e direita.

As configurações podem ser abertas pelo gerenciador de extensões do GNOME e
incluem posição, tamanho dos ícones, margem, animações do dock e das janelas e
três modos de visibilidade (ocultação inteligente, auto hide e sempre ativo),
além dos elementos exibidos. A página Sobre reúne website, relatório de erros,
créditos e informações legais.

## Compatibilidade

- GNOME Shell 48 (versão 48.4 no openSUSE Leap 16.0)
- Sessão Wayland

## Pacote oficial para openSUSE

O pacote oficial chama-se `sheliak` e é publicado no projeto OBS
`home:rodrigosbrito:lyra`.

No openSUSE Leap 16.0:

```sh
sudo zypper ar -f \
  https://download.opensuse.org/repositories/home:/rodrigosbrito:/lyra/openSUSE_Leap_16.0/ \
  home:rodrigosbrito:lyra
sudo zypper refresh
sudo zypper install sheliak
```

Depois da instalação, encerre e inicie a sessão GNOME e habilite a extensão:

```sh
gnome-extensions enable sheliak@lyraos.org
```

## Build

```sh
npm install
npm run check
npm run build
```

O diretório `dist/` contém a extensão pronta. Para gerar um ZIP:

```sh
npm run pack
```

## Instalação local

```sh
mkdir -p ~/.local/share/gnome-shell/extensions/sheliak@lyraos.org
cp -a dist/. ~/.local/share/gnome-shell/extensions/sheliak@lyraos.org/
gnome-extensions enable sheliak@lyraos.org
```

Em Wayland, encerre e inicie a sessão depois da primeira instalação.

## Empacotamento

O pacote do sistema deve instalar o conteúdo de `dist/` em:

`/usr/share/gnome-shell/extensions/sheliak@lyraos.org/`

O spec de referência está em `packaging/sheliak.spec`. O destino oficial é:

- Projeto OBS: `home:rodrigosbrito:lyra`
- Pacote: `sheliak`
- Repositório Git: `https://github.com/britors/Sheliak`

A imagem/meta-pacote do Lyra OS deve instalar `sheliak`, habilitar
`sheliak@lyraos.org` por padrão e remover a dependência de Dash to Dock. O
meta-pacote e o `Lyra-Themes` não fazem parte deste repositório; essa troca deve
ser aplicada no repositório que atualmente declara a dependência.

## Identidade visual

Sheliak só ativa suas cores Lyra quando `gtk-theme` ou o tema de Shell do
usuário contém `Lyra`. Nos demais temas, usa uma superfície neutra e permite
que ícones e controles venham do tema ativo.

O GNOME Shell 48 não expõe uma API pública estável de desfoque do conteúdo
atrás de um ator de extensão. A v1 usa transparência e sombra nativas; não usa
`Shell.BlurEffect`, pois esse efeito desfocaria o próprio dock.

## Licença

GPL-3.0-or-later.

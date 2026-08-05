import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const SCHEMA = 'org.gnome.shell.extensions.sheliak';

function addSwitch(group: Adw.PreferencesGroup, settings: Gio.Settings,
    key: string, title: string, subtitle: string): void {
    const row = new Adw.ActionRow({title, subtitle});
    const toggle = new Gtk.Switch({valign: Gtk.Align.CENTER});
    settings.bind(key, toggle, 'active', Gio.SettingsBindFlags.DEFAULT);
    row.add_suffix(toggle);
    row.activatable_widget = toggle;
    group.add(row);
}

function addSpin(group: Adw.PreferencesGroup, settings: Gio.Settings,
    key: string, title: string, subtitle: string, min: number, max: number,
    step: number): void {
    const row = new Adw.ActionRow({title, subtitle});
    const adjustment = new Gtk.Adjustment({lower: min, upper: max, step_increment: step});
    const spin = new Gtk.SpinButton({adjustment, numeric: true, valign: Gtk.Align.CENTER});
    settings.bind(key, spin, 'value', Gio.SettingsBindFlags.DEFAULT);
    row.add_suffix(spin);
    group.add(row);
}

function addMinimizeAnimation(group: Adw.PreferencesGroup, settings: Gio.Settings): void {
    const row = new Adw.ActionRow({
        title: 'Animação ao minimizar',
        subtitle: 'Efeito usado ao minimizar e restaurar janelas',
    });
    const values = [
        ['zoom', 'Zoom ao ícone'],
        ['fade', 'Desvanecer'],
        ['none', 'Sem animação'],
    ];
    const model = Gtk.StringList.new(values.map(([, label]) => label));
    const combo = new Gtk.DropDown({model, valign: Gtk.Align.CENTER});
    const selected = () => Math.max(0,
        values.findIndex(([id]) => id === settings.get_string('minimize-animation')));
    combo.selected = selected();
    combo.connect('notify::selected', () => settings.set_string(
        'minimize-animation', values[combo.selected]?.[0] ?? 'zoom'));
    settings.connect('changed::minimize-animation', () => combo.set_selected(selected()));
    row.add_suffix(combo);
    group.add(row);
}

function addPosition(group: Adw.PreferencesGroup, settings: Gio.Settings): void {
    const row = new Adw.ActionRow({title: 'Posição', subtitle: 'Lado da tela onde o dock aparece'});
    const values = [['bottom', 'Inferior'], ['top', 'Superior'], ['left', 'Esquerda'], ['right', 'Direita']];
    const model = Gtk.StringList.new(values.map(([, label]) => label));
    const combo = new Gtk.DropDown({model, valign: Gtk.Align.CENTER});
    const selected = () => Math.max(0, values.findIndex(([id]) => id === settings.get_string('position')));
    combo.selected = selected();
    combo.connect('notify::selected', () => settings.set_string('position', values[combo.selected]?.[0] ?? 'bottom'));
    settings.connect('changed::position', () => combo.set_selected(selected()));
    row.add_suffix(combo);
    group.add(row);
}

function addContentAlignment(group: Adw.PreferencesGroup, settings: Gio.Settings): void {
    const row = new Adw.ActionRow({title: 'Alinhamento', subtitle: 'Posição dos favoritos, apps abertos e lixeira ao longo do dock'});
    const values = [['start', 'Início'], ['center', 'Centro'], ['end', 'Fim']];
    const model = Gtk.StringList.new(values.map(([, label]) => label));
    const combo = new Gtk.DropDown({model, valign: Gtk.Align.CENTER});
    const selected = () => Math.max(0, values.findIndex(([id]) => id === settings.get_string('content-alignment')));
    combo.selected = selected();
    combo.connect('notify::selected', () => settings.set_string('content-alignment', values[combo.selected]?.[0] ?? 'center'));
    settings.connect('changed::content-alignment', () => combo.set_selected(selected()));
    row.add_suffix(combo);
    group.add(row);
}

function addRunningAppsPosition(group: Adw.PreferencesGroup, settings: Gio.Settings): void {
    const row = new Adw.ActionRow({title: 'Posição dos apps abertos', subtitle: 'Onde aplicativos em execução aparecem em relação aos favoritos'});
    const values = [['start', 'Início'], ['end', 'Fim']];
    const model = Gtk.StringList.new(values.map(([, label]) => label));
    const combo = new Gtk.DropDown({model, valign: Gtk.Align.CENTER});
    const selected = () => Math.max(0, values.findIndex(([id]) => id === settings.get_string('running-apps-position')));
    combo.selected = selected();
    combo.connect('notify::selected', () => settings.set_string('running-apps-position', values[combo.selected]?.[0] ?? 'end'));
    settings.connect('changed::running-apps-position', () => combo.set_selected(selected()));
    row.add_suffix(combo);
    group.add(row);
}

function addPanelMenuPosition(group: Adw.PreferencesGroup, settings: Gio.Settings): void {
    const row = new Adw.ActionRow({
        title: 'Posição na barra',
        subtitle: 'Área da barra superior onde os menus aparecem',
    });
    const values = [['left', 'Esquerda'], ['center', 'Centro'], ['right', 'Direita']];
    const model = Gtk.StringList.new(values.map(([, label]) => label));
    const combo = new Gtk.DropDown({model, valign: Gtk.Align.CENTER});
    const selected = () => Math.max(0,
        values.findIndex(([id]) => id === settings.get_string('panel-menu-position')));
    combo.selected = selected();
    combo.connect('notify::selected', () => settings.set_string(
        'panel-menu-position', values[combo.selected]?.[0] ?? 'left'));
    settings.connect('changed::panel-menu-position', () => combo.set_selected(selected()));
    row.add_suffix(combo);
    group.add(row);
}

function addHideMode(group: Adw.PreferencesGroup, settings: Gio.Settings): void {
    const row = new Adw.ActionRow({title: 'Visibilidade do dock', subtitle: 'Como o dock deve permanecer na tela'});
    const values = [
        ['intelligent', 'Ocultação inteligente'],
        ['autohide', 'Auto hide'],
        ['always', 'Sempre ativo'],
    ];
    const model = Gtk.StringList.new(values.map(([, label]) => label));
    const combo = new Gtk.DropDown({model, valign: Gtk.Align.CENTER});
    const selected = () => Math.max(0, values.findIndex(([id]) => id === settings.get_string('hide-mode')));
    combo.selected = selected();
    combo.connect('notify::selected', () => settings.set_string('hide-mode', values[combo.selected]?.[0] ?? 'intelligent'));
    settings.connect('changed::hide-mode', () => combo.set_selected(selected()));
    row.add_suffix(combo);
    group.add(row);
}

export default class SheliakPreferences extends ExtensionPreferences {
    async fillPreferencesWindow(window: Adw.PreferencesWindow): Promise<void> {
        console.debug('Sheliak: abrindo janela de preferências');
        const settings = this.getSettings(SCHEMA);
        const appearance = new Adw.PreferencesPage({title: 'Aparência', icon_name: 'preferences-desktop-theme-symbolic'});
        const appearanceGroup = new Adw.PreferencesGroup({title: 'Aparência'});
        addPosition(appearanceGroup, settings);
        addSpin(appearanceGroup, settings, 'icon-size', 'Tamanho dos ícones', 'Tamanho em pixels', 24, 96, 1);
        addSpin(appearanceGroup, settings, 'edge-margin', 'Margem da borda', 'Distância em pixels', 0, 48, 1);
        addSwitch(appearanceGroup, settings, 'animation', 'Animar o dock', 'Animar a entrada e saída do dock');
        addMinimizeAnimation(appearanceGroup, settings);
        addSwitch(appearanceGroup, settings, 'extend-to-edges', 'Estender até as bordas', 'Ocupar todo o comprimento da borda em vez de se ajustar ao conteúdo');
        addContentAlignment(appearanceGroup, settings);
        appearance.add(appearanceGroup);

        const behavior = new Adw.PreferencesPage({title: 'Comportamento', icon_name: 'preferences-system-symbolic'});
        const behaviorGroup = new Adw.PreferencesGroup({title: 'Comportamento'});
        addHideMode(behaviorGroup, settings);
        addSpin(behaviorGroup, settings, 'hide-delay', 'Atraso para ocultar', 'Após uma janela alcançar o dock, em milissegundos', 100, 3000, 100);
        addSwitch(behaviorGroup, settings, 'fullscreen-hide', 'Ocultar em tela cheia', 'Não cobrir aplicativos em tela cheia');
        behavior.add(behaviorGroup);

        const content = new Adw.PreferencesPage({title: 'Conteúdo', icon_name: 'view-grid-symbolic'});
        const contentGroup = new Adw.PreferencesGroup({title: 'Elementos exibidos'});
        addSwitch(contentGroup, settings, 'show-running', 'Aplicativos em execução', 'Mostrar aplicativos que não estão nos favoritos');
        addRunningAppsPosition(contentGroup, settings);
        addSwitch(contentGroup, settings, 'show-trash', 'Lixeira', 'Mostrar o botão da lixeira');
        addSwitch(contentGroup, settings, 'show-apps-button', 'Mostrar aplicativos', 'Mostrar o botão da grade de aplicativos');
        content.add(contentGroup);

        const panel = new Adw.PreferencesPage({
            title: 'Barra superior',
            icon_name: 'view-more-symbolic',
        });
        const panelGroup = new Adw.PreferencesGroup({title: 'Menus do painel'});
        addSwitch(panelGroup, settings, 'show-applications-menu', 'Menu Aplicativos',
            'Mostrar aplicativos instalados, organizados por categoria');
        addSwitch(panelGroup, settings, 'show-places-menu', 'Menu Locais',
            'Mostrar pastas pessoais, marcadores e dispositivos');
        addSwitch(panelGroup, settings, 'show-system-menu', 'Menu Sistema',
            'Mostrar atalhos para as configurações do Vega e a tela Sobre');
        addSwitch(panelGroup, settings, 'show-search-menu', 'Menu Busca',
            'Mostrar o ícone de busca de aplicativos e configurações');
        addSwitch(panelGroup, settings, 'hide-workspace-button',
            'Ocultar botão de áreas de trabalho',
            'Remover o botão nativo de áreas de trabalho da barra superior');
        addPanelMenuPosition(panelGroup, settings);
        panel.add(panelGroup);

        const panelContentGroup = new Adw.PreferencesGroup({title: 'Conteúdo dos menus'});
        addSwitch(panelContentGroup, settings, 'show-application-icons',
            'Ícones dos aplicativos', 'Mostrar o ícone ao lado do nome de cada aplicativo');
        addSwitch(panelContentGroup, settings, 'sort-applications-menu',
            'Ordem alfabética', 'Ordenar categorias e aplicativos alfabeticamente');
        addSwitch(panelContentGroup, settings, 'open-application-submenus-sideways',
            'Submenus laterais', 'Abrir as categorias de aplicativos ao lado do menu principal');
        addSwitch(panelContentGroup, settings, 'show-place-bookmarks',
            'Marcadores em Locais', 'Incluir os marcadores configurados no gerenciador de arquivos');
        addSwitch(panelContentGroup, settings, 'show-place-volumes',
            'Dispositivos em Locais', 'Incluir volumes e locais remotos montados');
        addSwitch(panelContentGroup, settings, 'show-system-about',
            'Item Sobre em Sistema', 'Mostrar o atalho para as informações do sistema instalado');
        panel.add(panelContentGroup);

        const about = new Adw.PreferencesPage({
            name: 'about', title: 'Sobre', icon_name: 'help-about-symbolic',
        });
        const aboutGroup = new Adw.PreferencesGroup({title: 'Sheliak'});
        const aboutRow = new Adw.ActionRow({title: 'Sobre o Sheliak', subtitle: 'Website, reportar erro, créditos e informações legais', activatable: true});
        aboutRow.connect('activated', () => showAboutDialog(window));
        aboutGroup.add(aboutRow);
        about.add(aboutGroup);

        window.add(appearance);
        window.add(behavior);
        window.add(content);
        window.add(panel);
        window.add(about);
    }
}

function showAboutDialog(window: Adw.PreferencesWindow): void {
    const dialog = new Adw.AboutDialog({
        application_name: 'Sheliak',
        application_icon: 'folder-download-symbolic',
        developer_name: 'Lyra OS',
        version: '1.4.2',
        website: 'https://github.com/britors/Sheliak',
        issue_url: 'https://github.com/britors/Sheliak/issues',
        license_type: Gtk.License.GPL_3_0,
        comments: 'Dock nativo do Lyra OS para o GNOME Shell.',
        copyright: '© 2026 Lyra OS',
    });
    dialog.set_developers(['Rodrigo Brito']);
    dialog.present(window);
}

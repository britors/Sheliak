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
        const settings = this.getSettings(SCHEMA);
        const appearance = new Adw.PreferencesPage({title: 'Aparência', icon_name: 'preferences-desktop-theme-symbolic'});
        const appearanceGroup = new Adw.PreferencesGroup({title: 'Aparência'});
        addPosition(appearanceGroup, settings);
        addSpin(appearanceGroup, settings, 'icon-size', 'Tamanho dos ícones', 'Tamanho em pixels', 24, 96, 1);
        addSpin(appearanceGroup, settings, 'edge-margin', 'Margem da borda', 'Distância em pixels', 0, 48, 1);
        addSwitch(appearanceGroup, settings, 'animation', 'Animações', 'Animar a entrada e saída do dock');
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
        addSwitch(contentGroup, settings, 'show-trash', 'Lixeira', 'Mostrar o botão da lixeira');
        addSwitch(contentGroup, settings, 'show-apps-button', 'Mostrar aplicativos', 'Mostrar o botão da grade de aplicativos');
        content.add(contentGroup);

        const about = new Adw.PreferencesPage({title: 'Sobre', icon_name: 'help-about-symbolic'});
        const aboutGroup = new Adw.PreferencesGroup({title: 'Sheliak'});
        const aboutRow = new Adw.ActionRow({title: 'Sobre o Sheliak', subtitle: 'Website, reportar erro, créditos e informações legais', activatable: true});
        aboutRow.connect('activated', () => {
            const dialog = new Adw.AboutDialog({
                application_name: 'Sheliak',
                application_icon: 'folder-download-symbolic',
                developer_name: 'Lyra OS',
                version: '1.0.0',
                website: 'https://github.com/britors/Sheliak',
                issue_url: 'https://github.com/britors/Sheliak/issues',
                license_type: Gtk.License.GPL_3_0,
                comments: 'Dock nativo do Lyra OS para o GNOME Shell.',
                copyright: '© 2026 Lyra OS',
            });
            dialog.set_developers(['Rodrigo Brito']);
            dialog.present(window);
        });
        aboutGroup.add(aboutRow);
        about.add(aboutGroup);

        window.add(appearance);
        window.add(behavior);
        window.add(content);
        window.add(about);
    }
}

import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';

const LIGHT_CLASS = 'lyra-light';
const DARK_CLASS = 'lyra-dark';

/**
 * Loads the GTK palette used only by the Sheliak preferences window and keeps
 * its light/dark variant in sync with libadwaita.
 */
export function installPreferencesTheme(window: Adw.PreferencesWindow,
    stylesheetPath: string): void {
    const provider = new Gtk.CssProvider();
    provider.load_from_path(stylesheetPath);

    const display = window.get_display();
    Gtk.StyleContext.add_provider_for_display(
        display, provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);

    window.add_css_class('sheliak-preferences');
    const styleManager = Adw.StyleManager.get_for_display(display);
    const syncColorScheme = () => {
        window.remove_css_class(styleManager.dark ? LIGHT_CLASS : DARK_CLASS);
        window.add_css_class(styleManager.dark ? DARK_CLASS : LIGHT_CLASS);
    };

    syncColorScheme();
    const colorSchemeSignal = styleManager.connect('notify::dark', syncColorScheme);

    window.connect('close-request', () => {
        styleManager.disconnect(colorSchemeSignal);
        Gtk.StyleContext.remove_provider_for_display(display, provider);
        return false;
    });
}

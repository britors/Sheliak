Name:           sheliak
Version:        1.1.0
Release:        6
Summary:        Native Lyra OS dock for GNOME Shell
License:        GPL-3.0-or-later
URL:            https://github.com/lyra-os/Sheliak
Source0:        %{name}-%{version}.tar.zst
BuildArch:      noarch
BuildRequires:  zstd
Requires:       gnome-shell >= 48
Requires:       gnome-shell < 49

%description
Sheliak is the Lyra OS dock for GNOME Shell. It displays favorite and running
applications, a dynamic Trash icon, application menus, and the native
applications grid button.

%prep
%autosetup

%build
# Release archives contain the pre-built GJS bundle. OBS builds never need
# network access or npm dependencies.
test -f dist/extension.js

%install
install -d %{buildroot}%{_datadir}/gnome-shell/extensions/sheliak@lyraos.org
install -m 0644 \
    dist/extension.js \
    dist/prefs.js \
    dist/metadata.json \
    dist/stylesheet.css \
    %{buildroot}%{_datadir}/gnome-shell/extensions/sheliak@lyraos.org/
install -d %{buildroot}%{_datadir}/gnome-shell/extensions/sheliak@lyraos.org/schemas
install -m 0644 dist/schemas/* \
    %{buildroot}%{_datadir}/gnome-shell/extensions/sheliak@lyraos.org/schemas/
install -d %{buildroot}%{_datadir}/gnome-shell/extensions/sheliak@lyraos.org/icons
install -m 0644 dist/icons/* \
    %{buildroot}%{_datadir}/gnome-shell/extensions/sheliak@lyraos.org/icons/

%files
%license LICENSE
%doc README.md
%dir %{_datadir}/gnome-shell
%dir %{_datadir}/gnome-shell/extensions
%dir %{_datadir}/gnome-shell/extensions/sheliak@lyraos.org
%{_datadir}/gnome-shell/extensions/sheliak@lyraos.org/extension.js
%{_datadir}/gnome-shell/extensions/sheliak@lyraos.org/prefs.js
%{_datadir}/gnome-shell/extensions/sheliak@lyraos.org/metadata.json
%{_datadir}/gnome-shell/extensions/sheliak@lyraos.org/stylesheet.css
%{_datadir}/gnome-shell/extensions/sheliak@lyraos.org/schemas
%{_datadir}/gnome-shell/extensions/sheliak@lyraos.org/icons

%changelog

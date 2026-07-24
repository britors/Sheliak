UUID := sheliak@lyraos.org
PREFIX ?= /usr
EXTENSIONDIR := $(DESTDIR)$(PREFIX)/share/gnome-shell/extensions/$(UUID)

.PHONY: all check clean dist install pack

all: dist

check:
	npm run check

dist:
	npm run build

pack: dist
	npm run pack

install: dist
	install -d "$(EXTENSIONDIR)"
	install -m 0644 dist/extension.js dist/prefs.js dist/metadata.json dist/stylesheet.css "$(EXTENSIONDIR)"
	install -d "$(EXTENSIONDIR)/schemas"
	install -m 0644 dist/schemas/* "$(EXTENSIONDIR)/schemas"

clean:
	npm run clean

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
	install -m 0644 dist/extension.js dist/metadata.json dist/stylesheet.css "$(EXTENSIONDIR)"

clean:
	npm run clean

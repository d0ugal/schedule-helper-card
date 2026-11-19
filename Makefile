.PHONY: install lint fmt test build typecheck

install:
	npm ci

lint:
	npm run lint
	npm run format:check
	npm run typecheck

fmt:
	npm run format

test:
	npm test

build:
	npm run build

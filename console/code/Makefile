# PLM — Programming Language Maker (CLI Edition)
# Makefile for building and running the PLM CLI toolchain.

# === Configuration ===
BUN ?= bun
NODE ?= node
INSTALL_PREFIX ?= /usr/local
BINDIR ?= $(INSTALL_PREFIX)/bin

# === Paths ===
SRC_DIR = src
CLI_DIR = cli
LIB_DIR = $(SRC_DIR)/lib
BUILTIN_DIR = $(LIB_DIR)/plm-builtin
TEST_DIR = scripts
DIST_DIR = dist
DOWNLOAD_DIR = download

# === Source files ===
CORE_SOURCES = \
	$(LIB_DIR)/qvm/opcodes.ts \
	$(LIB_DIR)/qvm/bytecode.ts \
	$(LIB_DIR)/qvm/vm.ts \
	$(LIB_DIR)/qvm/package.ts \
	$(LIB_DIR)/qvm/stdlib.ts \
	$(LIB_DIR)/plm/config.ts \
	$(LIB_DIR)/plm/lexer.ts \
	$(LIB_DIR)/plm/parser.ts \
	$(LIB_DIR)/plm/codegen.ts \
	$(LIB_DIR)/plm/compiler.ts

BUILTIN_SOURCES = \
	$(BUILTIN_DIR)/minilang.ts \
	$(BUILTIN_DIR)/minic.ts \
	$(BUILTIN_DIR)/pythonic.ts \
	$(BUILTIN_DIR)/minihaskell.ts \
	$(BUILTIN_DIR)/minilisp.ts \
	$(BUILTIN_DIR)/brainfuck.ts \
	$(BUILTIN_DIR)/owllang.ts

ALL_SOURCES = $(CORE_SOURCES) $(BUILTIN_SOURCES) $(LIB_DIR)/languages.ts $(CLI_DIR)/plm.ts

# === Targets ===
.PHONY: all build clean test install uninstall help run-ide packages

all: build

# Build the CLI as a bundled executable
build:
	@echo "Building PLM CLI..."
	@mkdir -p $(DIST_DIR)
	@$(BUN) build $(CLI_DIR)/plm.ts --outfile $(DIST_DIR)/plm --target bun --minify
	@chmod +x $(DIST_DIR)/plm
	@echo "Built: $(DIST_DIR)/plm"
	@echo "Run: ./$(DIST_DIR)/plm help"

# Build for Node.js (produces a CommonJS bundle)
build-node:
	@echo "Building PLM CLI for Node.js..."
	@mkdir -p $(DIST_DIR)
	@$(BUN) build $(CLI_DIR)/plm.ts --outfile $(DIST_DIR)/plm.js --target node --format cjs
	@echo "Built: $(DIST_DIR)/plm.js"
	@echo "Run: $(NODE) $(DIST_DIR)/plm.js help"

# Run the CLI directly with bun (no build needed)
run:
	@$(BUN) run $(CLI_DIR)/plm.ts $(ARGS)

# Run a specific language demo
demo:
	@$(BUN) run $(CLI_DIR)/plm.ts demo $(LANG)

# Run a source file
run-file:
	@$(BUN) run $(CLI_DIR)/plm.ts run $(CONFIG) $(SOURCE)

# Run all tests
test:
	@echo "Running all tests..."
	@for t in test-plm test-bf test-mhs test-mc test-ml test-py test-pkg test-owl; do \
	        echo "--- $$t ---"; \
	        $(BUN) run $(TEST_DIR)/$$t.ts 2>&1 | tail -3; \
	done
	@echo "All tests complete."

# Run a specific test
test-%:
	@$(BUN) run $(TEST_DIR)/test-$*.ts

# Run the blockchain demo (complex software test)
blockchain:
	@echo "Running OwlLang blockchain simulator..."
	@$(BUN) run $(CLI_DIR)/plm.ts run configs/owllang.plm.json examples/blockchain.owl

# List available packages
packages:
	@$(BUN) run $(CLI_DIR)/plm.ts packages

# List available languages
languages:
	@$(BUN) run $(CLI_DIR)/plm.ts list

# Export a standard package
export-pkg:
	@$(BUN) run $(CLI_DIR)/plm.ts packages $(PKG) > $(PKG).qvmpkg
	@echo "Exported: $(PKG).qvmpkg"

# Generate downloadable configs and examples
gen-configs:
	@$(BUN) run $(TEST_DIR)/gen-configs.ts

# Build standalone HTML
html:
	@echo "Building standalone HTML..."
	@$(BUN) run $(TEST_DIR)/build-standalone-html.ts
	@echo "HTML: $(DOWNLOAD_DIR)/plm.html"

# Install CLI globally
install: build
	@echo "Installing plm to $(BINDIR)..."
	@cp $(DIST_DIR)/plm $(BINDIR)/plm
	@chmod +x $(BINDIR)/plm
	@echo "Installed: $(BINDIR)/plm"

# Uninstall CLI
uninstall:
	@rm -f $(BINDIR)/plm
	@echo "Uninstalled plm"

# Clean build artifacts
clean:
	@rm -rf $(DIST_DIR)
	@rm -f $(DOWNLOAD_DIR)/configs/*.json
	@rm -f $(DOWNLOAD_DIR)/examples/sample.*
	@echo "Cleaned."

# Lint check
lint:
	@$(BUN) run lint

# Show help
help:
	@echo "PLM — Programming Language Maker"
	@echo ""
	@echo "Targets:"
	@echo "  make build          Build the CLI executable (dist/plm)"
	@echo "  make build-node     Build for Node.js (dist/plm.js)"
	@echo "  make run ARGS=...   Run CLI with arguments"
	@echo "  make demo LANG=...  Run a language demo (minilang, minic, etc.)"
	@echo "  make run-file CONFIG=... SOURCE=...   Run a source file"
	@echo "  make test           Run all tests"
	@echo "  make test-owl       Run OwlLang tests"
	@echo "  make blockchain     Run the blockchain simulator"
	@echo "  make packages       List available packages"
	@echo "  make languages      List available languages"
	@echo "  make export-pkg PKG=std.io   Export a package"
	@echo "  make gen-configs    Generate config files"
	@echo "  make html           Build standalone HTML"
	@echo "  make install        Install CLI globally"
	@echo "  make uninstall      Uninstall CLI"
	@echo "  make clean          Clean build artifacts"
	@echo "  make lint           Run linter"
	@echo "  make help           Show this help"
	@echo ""
	@echo "Available languages:"
	@$(BUN) run $(CLI_DIR)/plm.ts list 2>/dev/null || true
	@echo ""
	@echo "Available packages:"
	@$(BUN) run $(CLI_DIR)/plm.ts packages 2>/dev/null || true

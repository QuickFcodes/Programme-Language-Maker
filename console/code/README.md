# PLM — Programming Language Maker (CLI Edition)

A programming language generator that compiles custom languages to QVM bytecode.

## Quick Start

```bash
# Install bun (if not already installed)
curl -fsSL https://bun.sh/install | bash

# List available languages
make languages

# Run a demo
make demo LANG=minilang
make demo LANG=brainfuck
make demo LANG=owllang

# Run the blockchain simulator (complex software test)
make blockchain

# Run your own code
make run-file CONFIG=configs/minilang.plm.json SOURCE=examples/sample.ml

# Run all tests
make test

# Build the CLI executable
make build
./dist/plm help

# List available packages
make packages

# Export a package
make export-pkg PKG=std.io
```

## Available Languages

| Language | Extension | Description |
|---|---|---|
| MiniLang | .ml | Imperative language with functions, while loops |
| MiniC | .mc | C-like with arrays, for loops |
| Pythonic | .py | Python-like with def, for-in-range |
| MiniHaskell | .mhs | Functional with lambdas, case/match |
| MiniLisp | .lisp | Lisp/Scheme S-expressions |
| OwlLang | .owl | Object-oriented with classes, methods |
| Brainfuck | .bf | Esoteric 8-character language |

## Directory Structure

```
plm-cli/
├── src/
│   ├── lib/
│   │   ├── qvm/           # Virtual machine (opcodes, bytecode, vm, package, stdlib)
│   │   ├── plm/           # Compiler framework (config, lexer, parser, codegen, compiler)
│   │   └── plm-builtin/   # 7 built-in language configs
│   └── ...
├── cli/
│   └── plm.ts             # CLI entry point
├── scripts/               # Test scripts
├── configs/               # Language config files (.plm.json)
├── examples/              # Example programs
├── Makefile               # Build and run targets
├── package.json
└── tsconfig.json
```

## Running Programs

```bash
# Direct with bun
bun cli/plm.ts run configs/minilang.plm.json examples/sample.ml

# Or build and use the binary
make build
./dist/plm run configs/minilang.plm.json examples/sample.ml
```

## Writing Your Own Language

See `configs/minilang.plm.json` for a complete example. A language config has:
- `lexer`: token rules (no regex, character-class based)
- `grammar`: production rules (seq, choice, quantifiers)
- `codegen`: templates mapping AST nodes to bytecode
- `defaultImports`: standard packages to auto-import

## Package Management

QVM packages are universal — any language can use them.

```bash
# List packages
make packages

# Export a package to a file
make export-pkg PKG=std.io

# Use packages in your config
# Add "defaultImports": ["std.io", "std.math"] to your config
```

## Documentation

See the `docs/` directory in the full distribution for:
- Architecture overview
- Configuration format reference
- QVM instruction set
- Package management guide
- Development guide

# When not to wrap

Wrap only **order-independent** content: any order of the items behaves the same, and the order is
only for readers. keep-sorted cannot detect order-dependent content, and tests often miss the
change, so this check is yours.

## The test

Before wrapping, answer each question for the exact lines. One "yes" makes the content
**order-dependent**: leave it unwrapped and tell the user why.

1. Is the first match used, or does a later item override an earlier one?
2. Does an item read, call, or initialize from something defined above it in the range?
3. Is position the meaning, as with positional arguments, tuple fields, or columns?
4. Does running, importing, or registering an item have a side effect another item relies on?
5. Is the order part of an external contract, such as a wire format, memory layout, or serialized
   output?
6. Do comments or docs say the order matters, or does the list look curated (most important first)?

When you are unsure, ask the user, and wrap only after they confirm.

## Order-dependent content

| Content                                                                              | Why order matters                                       |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| Middleware, interceptors, plugin and filter chains                                   | Each wraps or short-circuits the next                   |
| Routes, URL patterns, firewall and ACL rules, CODEOWNERS, `.gitignore` negations     | First or last match wins, so the order picks the winner |
| Precedence and fallback lists: config search paths, `PATH`, resolvers, locales       | Earlier entries shadow later ones                       |
| CSS rules and declarations                                                           | The cascade: a later rule of equal specificity wins     |
| Positional arguments, tuple and record fields, CSV or table columns                  | Position is the meaning                                 |
| Imports with side effects: polyfills, `reflect-metadata`, monkey patches, env setup  | Must run first                                          |
| Imports a formatter already orders: goimports, isort, Ruff, rustfmt, ESLint rules    | Two sorters fight; leave it to the formatter            |
| Migrations, SQL statements, build or pipeline steps, Dockerfile instructions         | Each step depends on the ones before                    |
| Enums whose numeric values are implicit (C, C++, Java `ordinal()`, protobuf numbers) | Values or persisted ordinals change                     |
| Overloads, `match`/`switch` cases, `if`/`else` chains, exception handlers            | Earlier cases take precedence                           |

## Functions and class members

Definitions are usually safe to reorder, but these are order-dependent:

- **Struct and class fields** where layout or declaration order is observable: C and C++ structs, Go
  structs passed to C or `unsafe`, Rust `#[repr(C)]`, and formats that serialize in declaration
  order.
- **Rust `#[derive(PartialOrd, Ord)]`**, which compares fields in declaration order.
- **C++ member initialization**, which follows declaration order, not the initializer list.
- **Field initializers** that read an earlier field (`b = this.a + 1`) and class attributes that
  reference earlier ones.
- **TypeScript overload signatures**, which stay together, directly above their implementation.
- **Decorators that register in order**: Flask and FastAPI routes, CLI subcommands, pytest fixtures
  with ordering, event handlers.
- **Module-level code that calls a function** defined later in the range, in languages that execute
  top to bottom (Python, JavaScript, shell).

## Order-independent content

These usually pass the test: dependency lists, feature flags, enum members with explicit values,
string constants, map and dict literals with unique keys, `__all__`, glossary entries, and method
definitions in a class with none of the cases above.

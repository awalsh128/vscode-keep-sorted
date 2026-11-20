# Example briefs

## explorer

```markdown
## Goal

Find where HTTP retries are configured, so I can add a retry cap to the upload client.

## Context

The upload client is src/upload/client.ts. It doesn't retry by itself, so retries must come from a
wrapper or shared config.

## Decisions already made

Only the upload path matters; ignore the download client.
```

## researcher

```markdown
## Goal

Does actions/cache v5 still support `enableCrossOsArchive`? I'm about to use it in CI.

## Context

We pin actions by SHA. The workflow runs on ubuntu-latest and windows-latest.

## Decisions already made

We're staying on actions/cache; don't suggest alternatives.
```

## planner

```markdown
## Goal

Plan moving config loading from env vars to a config.toml file, keeping env vars as overrides.

## Context

Config is read in src/config.ts (one function, loadConfig). Tests are in test/config.test.ts.

## Decisions already made

Use the toml package that's already a dependency. Don't change the names of existing env vars.
```

## reviewer

````markdown
## Goal

Review this change against the task: "Uploads over 100 MB fail with a timeout; split them into 8 MB
parts."

## Context

```diff
<paste git diff output here>
```

## Decisions already made

Part size is fixed at 8 MB for now; making it configurable is out of scope.
````

## verifier

```markdown
## Goal

Check the multipart upload change.

## Context

Changed: src/upload/client.ts, src/upload/parts.ts, test/upload/parts.test.ts.
```

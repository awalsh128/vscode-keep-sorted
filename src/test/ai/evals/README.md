# Agent evals

Cases for agents that help users of Keep Sorted: should wrap, should not wrap, preference-driven
options, and marker repairs. [cases.ts](cases.ts) holds each prompt, input file, preferences, and
expected outcome with its rationale.

## Automated layer

```bash
npm run test:ai-evals
```

[evals.test.ts](evals.test.ts) replays each case's reference action through the shared tools on a
scratch workspace and grades the result with [grade.ts](grade.ts), using the bundled binary. It also
checks that the grader rejects wrong outputs: wrapping order-dependent content, another language's
comment syntax, missing or extra options, and lost lines. These tests run without VS Code and also
run in `npm test`.

## Agent runs (manual)

Agent behavior depends on the model and client, so it is graded by hand with the same grader.

1. Build once: `npm run compile`. List the cases: `npm run ai-evals -- list`.
2. For each case, create a scratch workspace with the case's file. Print it and the prompt with
   `npm run ai-evals -- prompt <case-id>`. For preference cases, add the case's preferences to the
   workspace's `.vscode/settings.json` as `keep-sorted.wrap.preferences`.
3. Run the prompt in the agent under test, in one of these configurations:
   - **Baseline**: no Keep Sorted tools or instructions.
   - **Docs**: the skill or AGENTS.md section from **Keep Sorted: Add AI Instructions to
     Workspace**, without tools.
   - **Tools**: Copilot agent mode with the language model tools, or another agent with the MCP
     server.
4. Grade the file the agent left: `npm run ai-evals -- grade <case-id> <file>`. It prints `PASS` or
   one `FAIL` line per defect and exits non-zero on failure.
5. Record the pass count per configuration and agent. Compare configurations on the same agent and
   model; a `no-wrap` failure is the most serious, since it changes behavior silently.

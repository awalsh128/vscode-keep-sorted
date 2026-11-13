---
name: keep-sorted
description:
  Keep lists, imports, and definitions sorted with keep-sorted blocks. Use when adding, editing, or
  sorting a keep-sorted block, or when the user asks to keep code sorted or alphabetized.
---

# keep-sorted

The Keep Sorted extension sorts the lines between keep-sorted marker comments. Its tools carry the
full guide for the installed version.

1. **Check the content is order-independent.** Call `keepSorted_getGuide` with topic `overview`,
   then `when-not-to-wrap`. Done when you can state why any order of the lines behaves the same;
   when you cannot, leave them unwrapped and tell the user why.
2. **Wrap.** Call `keepSorted_wrapRange`; it applies the user's preferences and the file's comment
   syntax. For functions or class members, read topic `choosing-options` first.
3. **Sort and verify.** Call `keepSorted_run` with scope `file`, then read the diff. Done when only
   lines inside the block moved, each item whole, and no problems remain.

When the `keepSorted_*` tools are missing, ask the user to run **Keep Sorted: Add AI Instructions to
Workspace** in VS Code and set up the MCP server.

# Verification

Run these steps after every wrap and every sort. The block is verified when all four pass.

1. **Sort.** Run `keepSorted_run` with `scope: "file"` for the file you changed. Use
   `scope: "workspace"` only when the user asked for the whole workspace. Without the tool, run the
   **Keep Sorted: Sort Current File** command.
2. **Read the diagnostics.** The tool returns the diagnostics that remain. Each one names lines and
   a reason; a missing partner or an invalid option means the markers or options need fixing, not
   another sort. Passes when none remain for the lines you changed.
3. **Read the diff.** Compare the file with its state before you wrapped it. Passes when:
   - the only added lines are the two markers;
   - every changed line sits between the markers;
   - each item moved whole: a multi-line item's lines, its comments, and its decorators are together
     and in their original order;
   - no item disappeared, unless the user wanted duplicates removed.
4. **Check the file still works.** Run the formatter, type checker, or tests the project uses for
   that file. Passes when they report what they reported before the wrap.

When step 3 shows an item split apart, undo the sort, add the options from
[choosing-options.md](choosing-options.md#functions-and-class-members), and sort again. When the new
order changes behavior, remove the markers, restore the original order, and tell the user the
content is order-dependent.

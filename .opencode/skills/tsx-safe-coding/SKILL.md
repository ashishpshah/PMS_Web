---
name: tsx-safe-coding
description: Prevent and diagnose TypeScript/TSX syntax errors, JSX nesting issues, unbalanced braces, and cascading parser errors. Use when creating, editing, debugging, or fixing React TypeScript/TSX code.
---

# TSX Safe Coding

You are a senior React + TypeScript + TSX coding agent.

Your priority is to produce valid, compilable code while preserving existing functionality.

## Rules

1. NEVER rewrite an entire file to fix a localized syntax error.
2. NEVER perform unnecessary refactoring.
3. NEVER remove working code simply to eliminate an error.
4. Preserve existing UI, state, API calls, business logic, behaviour, and component structure.
5. Make the smallest safe change required.
6. Never use `any`, `@ts-ignore`, `@ts-nocheck`, or compiler configuration changes to hide errors.

## Diagnose Root Errors First

When multiple TypeScript errors appear:

1. Find the FIRST parser/syntax error.
2. Inspect the code immediately before that location.
3. Assume later parser errors may be cascading.
4. Fix the earliest structural problem first.
5. Re-run validation.
6. Only fix remaining errors after the root error is resolved.

For errors such as:

- `JSX element has no corresponding closing tag`
- `Unexpected token`
- `'}' expected`
- `')' expected`
- `Expression expected`
- `Declaration or statement expected`

Check for:

- Missing JSX closing tags
- Incorrect JSX nesting
- Unbalanced `{}`, `()`, `[]`
- Broken `{condition && (...)}`
- Broken ternary JSX
- Broken `.map(() => (...))`
- Unclosed fragments `<>...</>`
- Unclosed template literals
- JavaScript accidentally placed inside JSX
- JSX accidentally placed inside JavaScript
- Missing commas or delimiters

Do NOT assume complex helper functions are the cause simply because a component is large.

## JSX Safety

Before completing any TSX modification, verify:

- Every opening JSX tag has the correct closing tag.
- JSX nesting is valid.
- Every `{...}` expression is closed.
- Every `(...)` expression is closed.
- Every `[...]` expression is closed.
- Every `.map()`, `.filter()`, callback, and ternary is complete.
- Every fragment is closed.
- `return (...)` is properly closed.
- Component and function braces are correctly balanced.

Prefer readable formatting:

```tsx
return (
    <div>
        {items.map(item => (
            <div key={item.id}>
                {item.name}
            </div>
        ))}
    </div>
);
```

## Aggressive JSX Validation Categories

Analyze the input thoroughly and aggressively check for the following categories:

### 1. Tag, Fragment, & Nesting Validation
- **Missing Self-Closing Slashes:** Check void elements like `<img>`, `<input>`, `<br>`, `<hr>` to ensure they end with `/>`.
- **Mismatched Tags:** Catch typos and out-of-order tag closures (e.g., `<div><span></div></span>` or `<div>...<div/>`).
- **Unclosed Fragments:** Ensure `<>` has a matching `</>` and that fragments are syntactically sound.
- **Illegal HTML Nesting:** Look for invalid structural hierarchies like putting a `<div>` or a block element inside a `<p>` tag, or nesting an `<a>` inside another `<a>`.
- **Root Element Violations:** Ensure adjacent JSX sibling elements are wrapped cleanly in a single parent component or Fragment.

### 2. Token & Bracket Balance
- **Unbalanced Closures:** Track every instance of `{ }`, `( )`, and `[ ]` within both the JSX expression interpolation and the enclosing JavaScript/TypeScript logic to ensure total balance.
- **Unescaped Text Characters:** Identify unescaped literals like `<`, `>`, `{`, or `}` sitting inside raw text nodes that break the JSX parser.

### 3. Inline Expression & Logic Validation
- **Broken Logical Shortcuts:** Check `{condition && (<Component />)}` for missing wrapping parentheses or logic that accidentally returns falsy UI values like `0` or `NaN`.
- **Malformed Ternary Operations:** Scan `{condition ? (<Success />) : (<Failure />)}` for missing colons, missing question marks, misplaced statements, or bad wrapping.

### 4. Array Looping & Rendering
- **Broken Array Maps:** Scan `.map(...)` callbacks inside the JSX tree. Catch instances where curly braces `{}` were used without an explicit `return` statement (resulting in implicit `undefined` renders).
- **Missing Key Props:** Verify that the topmost element rendered within any array `.map()` loop contains a valid, unique `key` prop.

### 5. TypeScript / Compiler Ambiguity
- **Generic Arrow Functions:** In `.tsx` files, verify that generic arrow functions do not trip up the JSX parser (e.g., ensure `<T>` is declared as `<T,>` or uses an `extends` clause to distinguish it from an opening JSX tag).

## Existing File Modification

Before editing:

- Understand the surrounding component structure.
- Identify the exact location requiring change.
- Do not rewrite unrelated sections.

After editing:

- Re-check the surrounding JSX.
- Re-check `{}`, `()`, and `[]`.
- Preserve existing behaviour.
- Validate immediately.

NEVER respond to a local syntax problem by saying or doing:

> "Let me rewrite the entire file with a cleaner structure."

Only refactor when explicitly required or when the existing architecture genuinely prevents the requested change.

## Validation

After meaningful changes, run the project's existing validation.

Prefer the project's configured commands:

```bash
npm run typecheck
npx tsc --noEmit
npm run build
```

Use the command actually supported by the project.

If validation reports multiple errors:

- Fix the earliest parser error.
- Re-run validation.
- Determine whether remaining errors disappear as cascading errors.
- Continue only with genuine remaining errors.

Do not fix every reported line independently when they may originate from one structural mistake.

## Error Example

If the compiler reports:

```
Line 575: JSX element 'div' has no corresponding closing tag
Line 688: Unexpected token
Line 688: Unexpected token
```

Treat the line 575 JSX error as the likely root cause.

Inspect the JSX between line 575 and the next structural boundary.

Do NOT immediately modify line 688.

Fix the missing/mismatched JSX or delimiter first, then validate again.

## No Error Masking

Never solve syntax errors by:

- Deleting large sections
- Commenting out functionality
- Replacing the component
- Adding random braces
- Adding random closing tags
- Suppressing TypeScript errors
- Disabling strict checks
- Changing compiler configuration unnecessarily
- Converting valid types to `any`

Fix the actual source of the error.

## Completion Criteria

A TSX task is complete only when:

- TypeScript syntax is valid.
- JSX syntax is valid.
- JSX nesting is correct.
- `{}`, `()`, and `[]` are balanced.
- Component/function boundaries are correct.
- No avoidable parser errors remain.
- Existing functionality is preserved.
- No unnecessary refactoring was performed.
- Project validation passes.

Never claim a syntax issue is fixed until validation has actually passed.

## Validation Protocol

After any edit to `.tsx`, `.ts`, or `.js` files, run:

```bash
# Frontend (React + TypeScript)
cd ClientApp && npm run lint   # tsc --noEmit
cd ClientApp && npm run build  # Vite build

# Backend (C#)
dotnet build
dotnet test PMS.Tests/PMS.Tests.csproj  # if tests exist
```

- **Never skip validation** — even for "small" changes
- **Fix root cause** — don't suppress errors with `any`, `@ts-ignore`, or disabled rules
- **Stop on first error** — fix earliest error, re-validate, continue
- **Report outcome** — "Build passed" or "Fixed X errors" with file:line references

## Common Error Patterns

| Error Type | Example | Fix Approach |
|------------|---------|--------------|
| Missing closing tag | `TS17008: JSX element 'div' has no corresponding closing tag` | Check JSX nesting, match every `<Tag>` with `</Tag>` |
| Unmatched braces | `TS1381: Unexpected token. Did you mean '}'?` | Count `{` vs `}` in edited region |
| Missing imports | `TS2304: Cannot find name 'X'` | Add import from correct path |
| Type mismatches | `TS2322: Type 'X' not assignable to 'Y'` | Fix logic or add proper type assertion |
| Unused variables | `TS6133: 'x' is declared but never used` | Remove or use the variable |

## Integration

Add to `.opencode/opencode.json`:
```json
{
  "skills": {
    "paths": [".opencode/skills"]
  }
}
```

Then restart opencode. This skill activates on TSX/TS edits.
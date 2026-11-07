# tinystyle

> Tiny CSS library for plain, semantic HTML. Elements look finished without classes. Variants are
> `data-*` attributes with fixed values. Light and dark mode switch automatically.

## Rules

1. Write semantic HTML first. `button`, `input`, `select`, `textarea`, `label`, `fieldset`, `dialog`,
   `[popover]`, `details`, `table`, `article` (card), `dl`, `progress`, `code`, `kbd` are styled
   without any attributes.
2. Use HTML and ARIA state, not attributes of your own: `disabled`, `aria-busy="true"` (spinner),
   `aria-invalid="true"` (error border), `aria-pressed="true"` (toggled), `aria-current`.
3. Variants are the `data-*` attributes listed below, with exactly the listed values. Each attribute
   is one independent axis: `data-variant` is the style, `data-tone` is the color, `data-size` is the
   size. Do not invent classes or values for these.
4. **Spacing:** nothing has an outer margin. The parent owns all space: `data-gap` between its
   children (needs `data-layout`), `data-pad` around them. Do not write `margin` or `padding` in
   `style` attributes. To add space between two things, wrap them in a `data-layout` element.
   `data-layout` overrides an element's own display, so `<label data-layout="row">` is a real row.
5. Sizes always use the same words: `xs sm md lg xl`. There are no numeric scales.
6. Your own CSS always wins over tinystyle (tinystyle lives in `@layer ts.*`). Never use `!important`.
   In your own CSS, use the tokens (`var(--ts-text-muted)`, `var(--ts-space-sm)`), never hard-coded colors.
7. Use `class` only for your app's own components. `data-*` attributes from the list below belong to
   tinystyle; do not use those names for anything else.
8. Run `npx tinystyle check <dir>` after editing. It reports unknown attribute values and tokens.

## Attributes

{{attributes}}

## Tokens

Set inputs on `:root` in your own CSS to change the theme. Use the rest in your own CSS.

{{tokens}}

## Recipes

### Form

```html
<form data-layout="stack" data-gap="md">
  <label>Name <input name="name" required></label>
  <div data-layout="grid" data-gap="sm" style="--ts-min: 10rem">
    <label>Start <input type="date"></label>
    <label>Time <input type="time"></label>
  </div>
  <label>Calendar <select><option>Work</option></select></label>
  <label><input type="checkbox" role="switch"> All day</label>
  <label>Email
    <input type="email" aria-invalid="true">
    <small data-tone="danger">Enter a full address, like name@example.com.</small>
  </label>
  <div data-layout="row" data-gap="sm" data-justify="end">
    <button type="button" data-variant="ghost">Cancel</button>
    <button>Save</button>
  </div>
</form>
```

### Card

```html
<article data-layout="stack" data-gap="sm">
  <header><h3>Title</h3><button data-icon data-variant="ghost" aria-label="Close">×</button></header>
  <p>Body text.</p>
  <footer><button data-variant="secondary">Edit</button></footer>
</article>
```

`article > header` puts its children in a row with space between. `article > footer` aligns its
buttons to the end.

### Dialog

```html
<button commandfor="confirm" command="show-modal" data-tone="danger">Delete…</button>
<dialog id="confirm">
  <header><h2>Delete “Team retro”?</h2></header>
  <p>This sends a cancellation to all guests.</p>
  <footer>
    <button commandfor="confirm" command="close" data-variant="secondary">Keep</button>
    <button data-tone="danger">Delete event</button>
  </footer>
</dialog>
```

### Toolbar

```html
<div data-layout="row" data-gap="xs" data-justify="between">
  <h2>Contacts</h2>
  <div data-layout="row" data-gap="xs">
    <input type="search" placeholder="Search" aria-label="Search">
    <button data-icon data-variant="ghost" aria-label="Add contact">+</button>
  </div>
</div>
```

### Status

```html
<span data-badge data-tone="success">Synced</span>
<span data-badge style="--ts-tone: #e8590c">Custom color</span>
<div data-callout data-tone="warning" role="status"><strong>Password expires soon</strong>Update it before 1 December.</div>
<button aria-busy="true">Saving</button>
```

### Settings rows

```html
<div data-layout="stack" data-gap="none" data-density="compact">
  <label data-layout="row" data-justify="between" data-pad="sm">Email notifications <input type="checkbox" role="switch"></label>
  <label data-layout="row" data-justify="between" data-pad="sm">Show week numbers <input type="checkbox" role="switch"></label>
</div>
```

### Label/value pairs

```html
<dl data-pairs>
  <dt>From</dt><dd>Priya Raman</dd>
  <dt>Date</dt><dd><time>Sat 7 Nov, 08:15</time></dd>
</dl>
```

### Page layout

```html
<main data-layout="center" data-gap="xl" data-pad="xl">
  <section data-layout="stack" data-gap="md">…</section>
  <section data-layout="grid" data-gap="lg" style="--ts-min: 20rem">…</section>
</main>
```

## Anti-patterns

| Don't | Do |
|---|---|
| `<button class="secondary">` | `<button data-variant="secondary">` |
| `<button data-variant="danger">` | `<button data-tone="danger">` (tone is color, variant is style) |
| `<button data-variant="primary">` | `<button>` (primary is the default) |
| `<p class="error">` | `<p data-tone="danger">` or `<div data-callout data-tone="danger">` |
| `style="margin-top: 1rem"` on a button or input | wrap the elements in `data-layout="stack" data-gap="md"` |
| `style="padding: var(--ts-space-lg)"` | `data-pad="lg"` |
| a custom class to turn a `label` into a flex row | `<label data-layout="row" data-justify="between">` |
| `data-gap="4"` or `data-gap="16px"` | `data-gap="md"` |
| `<button data-icon>×</button>` | `<button data-icon aria-label="Close">×</button>` |
| `data-badge="true"` | `data-badge` |
| `color: #666` in app CSS | `color: var(--ts-text-muted)` |
| `!important` to beat tinystyle | a plain selector; app CSS already wins |

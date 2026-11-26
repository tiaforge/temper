# Agent eval: tasks

Ten UI tasks from a calendar and mail app. Each is one HTML page, written by an agent that has only the CSS
library's own documentation. The same tasks serve any library: nothing here names temper's attributes. The grader
(`grade.mjs`) opens each page in headless Chrome at 1024×768, in light and dark mode, and measures it; the element
ids below are what it finds.

Rules for every page:

- One file per task, named as in the heading (`01-event-form.html`, …), each a complete HTML document.
- Load the library with exactly the `<link>`/`<script>` lines the run's instructions give, and nothing else from the
  network.
- Light and dark mode follow the system setting (`prefers-color-scheme`); no toggle.
- Use the library as its documentation says. Write your own CSS only where the library has no way to do it.
- Every control needs an accessible name. Use the element ids given; they may be on any suitable element.

## 01-event-form.html: event form

A form to create a calendar event: a required title (`#title`), start and end date-times (`#start`, `#end`), a
calendar picker with the options Personal, Work and Family (`#calendar`), notes (`#notes`), and two buttons: Save
(`#save`, the main action, submits) and Cancel (`#cancel`). The fields are stacked with even spacing; the buttons sit
in one row at the end of the form.

## 02-delete-confirm.html: delete confirmation

A modal confirmation dialog (`#confirm`, a `<dialog>`) that opens when the page loads, asking whether to delete the
event "Team sync". It has a heading, one sentence of text, and two buttons: Delete (`#delete`, destructive, red) and
Cancel (`#keep`). The buttons sit in one row at the end of the dialog.

## 03-outline-danger.html: outline danger button

On a settings page, a button "Remove account" (`#remove`) that is destructive but not the main action: outlined (no
fill, a red border) with red text.

## 04-invalid-field.html: invalid field

An email field (`#email`, labelled "Email") holding the value `ada@` that failed validation, with the error message
"Enter a full address, like name@example.com." (`#email-error`) under it. The field is marked invalid for assistive
technology and points to its message; the field and the message show the error in red.

## 05-toolbar.html: toolbar

A toolbar (`#toolbar`) above a mail list: a search field (`#search`) that takes all the space the buttons leave, a
"New message" button (`#new`, the main action) and an icon-only refresh button (`#refresh`). Everything in one row,
vertically centred.

## 06-status-badges.html: status badges

Three invoice statuses as small badges: "Paid" (`#paid`, success, green), "Due soon" (`#due`, warning, yellow or
orange) and "Overdue" (`#overdue`, danger, red), side by side.

## 07-settings-switches.html: settings switches

Three settings, each a label with an on/off switch: "Email notifications" (`#notify`, on), "Play sounds"
(`#sounds`, off) and "Weekly digest" (`#digest`, on). Each label is on the same row as its switch, and the switches
line up at the end of the rows.

## 08-dark-mode.html: dark mode

A card (`#card`) with a heading "Today", a paragraph of text and a link "Open calendar" (`#open`). In dark mode the
page and the card are dark with light text; in light mode the opposite. No toggle: it follows the system.

## 09-brand-color.html: brand colour

The app's brand colour is teal (hue about 185°). Make it the colour of the main button "Create event" (`#create`)
and of a link "Learn more" (`#learn`), in light and dark mode, keeping the text readable.

## 10-exact-spacing.html: exact spacing

Three cards (`#a`, `#b`, `#c`), each with a heading and a line of text, side by side in one row, with exactly 16px
between the cards and exactly 24px of padding inside each card.

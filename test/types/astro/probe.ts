declare const failed: boolean;
export const ok: astroHTML.JSX.HTMLAttributes = { 'data-tone': failed ? 'danger' : null, 'data-badge': true };
export const bad1: astroHTML.JSX.HTMLAttributes = { 'data-tone': failed ? 'danger' : 'sucess' }; // expect
export const bad2: astroHTML.JSX.HTMLAttributes = { 'data-collapsed': failed }; // expect

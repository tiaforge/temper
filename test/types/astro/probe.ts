declare const failed: boolean;
export const ok: astroHTML.JSX.HTMLAttributes = { 'data-tm-tone': failed ? 'danger' : null, 'data-tm-badge': true };
export const bad1: astroHTML.JSX.HTMLAttributes = { 'data-tm-tone': failed ? 'danger' : 'sucess' }; // expect
export const bad2: astroHTML.JSX.HTMLAttributes = { 'data-tm-collapsed': failed }; // expect

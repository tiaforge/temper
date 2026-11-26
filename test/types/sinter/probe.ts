declare const failed: boolean;
type Attr = { [K in keyof SinterAttributes]?: SinterAttributes[K] } & Record<string, unknown>;
export const ok: Attr = { 'data-tm-tone': failed && 'danger', 'data-tm-collapsed': failed, 'data-tm-scroll': true, title: 'x' };
export const bad: Attr = { 'data-tm-tone': failed ? 'danger' : 'sucess' }; // expect

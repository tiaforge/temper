declare const failed: boolean;
type Attr = { [K in keyof SinterAttributes]?: SinterAttributes[K] } & Record<string, unknown>;
export const ok: Attr = { 'data-tone': failed && 'danger', 'data-collapsed': failed, 'data-scroll': true, title: 'x' };
export const bad: Attr = { 'data-tone': failed ? 'danger' : 'sucess' }; // expect

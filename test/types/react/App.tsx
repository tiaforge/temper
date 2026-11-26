export function App({ failed, collapsed }: { failed: boolean; collapsed: boolean }) {
  return <>
    <span data-tm-badge data-tm-tone={failed ? 'danger' : 'success'}>ok</span>
    <nav data-tm-rail data-tm-collapsed={collapsed || null}></nav>
    <div data-tm-layout="grid" data-tm-cols={3}></div>
    <span data-tm-tone={failed ? 'danger' : 'sucess'}>bad</span> {/* expect */}
    <nav data-tm-rail data-tm-collapsed={collapsed}></nav> {/* expect */}
    <div data-tm-layout="stack" data-tm-gap="16px"></div> {/* expect */}
    <div data-tm-cols={9}></div> {/* expect */}
  </>;
}

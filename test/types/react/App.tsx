export function App({ failed, collapsed }: { failed: boolean; collapsed: boolean }) {
  return <>
    <span data-badge data-tone={failed ? 'danger' : 'success'}>ok</span>
    <nav data-rail data-collapsed={collapsed || null}></nav>
    <div data-layout="grid" data-cols={3}></div>
    <span data-tone={failed ? 'danger' : 'sucess'}>bad</span> {/* expect */}
    <nav data-rail data-collapsed={collapsed}></nav> {/* expect */}
    <div data-layout="stack" data-gap="16px"></div> {/* expect */}
    <div data-cols={9}></div> {/* expect */}
  </>;
}

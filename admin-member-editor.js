// Presentation only. Authorization and all existing saves remain in firebase-admin.js.
const tabs = [...document.querySelectorAll('[data-member-view]')];
export function selectMemberView(view, focus = false) {
  if (!tabs.some(tab => tab.dataset.memberView === view)) view = 'profile';
  for (const tab of tabs) {
    const selected = tab.dataset.memberView === view;
    tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
    if (selected && focus) tab.focus();
  }
  document.querySelectorAll('[data-member-panel]').forEach(panel => { panel.hidden = panel.dataset.memberPanel !== view; });
  document.querySelectorAll('[data-member-save-bar]').forEach(bar => { bar.hidden = view === 'roles'; });
  document.querySelectorAll('[data-member-invite-slot]').forEach(slot => { slot.hidden = view !== 'access'; });
}
for (const tab of tabs) {
  tab.addEventListener('click', () => selectMemberView(tab.dataset.memberView));
  tab.addEventListener('keydown', event => {
    const index = tabs.indexOf(tab);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : -1;
    if (next < 0) return;
    event.preventDefault(); selectMemberView(tabs[next].dataset.memberView, true);
  });
}
// Reveal invalid fields before native validation tries to focus them.
let revealingInvalid = false;
document.getElementById('adminMemberForm')?.addEventListener('invalid', event => {
  if (revealingInvalid) return;
  revealingInvalid = true; setTimeout(() => { revealingInvalid = false; }, 0);
  const panel = event.target.closest('[data-member-panel]');
  if (panel) selectMemberView(panel.dataset.memberPanel);
}, true);
selectMemberView('profile');

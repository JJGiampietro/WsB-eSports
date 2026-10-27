// Card labels are public team memberships, never private website permissions.
import { db } from './firebase-client.js';
import { collection, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { membershipLabels } from './membership-model.js';
import './display-only-members.js';

const grid = document.getElementById('membersGrid');
if (grid) {
  let memberships = new Map(), queued = false;
  function paint() {
    let changed = false;
    grid.querySelectorAll('.member-card[data-member-id]').forEach(card => {
      const id = card.dataset.memberId;
      const assigned = globalThis.WsbDisplayOnly.membershipFor(id) || memberships.get(id);
      const role = Object.hasOwn(membershipLabels, assigned) ? assigned : 'member';
      const label = card.querySelector('.member-meta b');
      if (!label) return;
      if (label.textContent !== membershipLabels[role]) { label.textContent = membershipLabels[role]; changed = true; }
      if (card.dataset.membershipRole !== role) { card.dataset.membershipRole = role; changed = true; }
      label.title = 'Team membership assigned by WsB admins. Website admin access is separate.';
    });
    if (changed) document.dispatchEvent(new Event('wsb:memberships-applied'));
  }
  function schedulePaint() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; paint(); });
  }
  onSnapshot(collection(db, 'memberMemberships'), snapshot => {
    memberships = new Map(snapshot.docs.map(entry => [entry.id, entry.data().role]));
    schedulePaint();
  }, () => {
    // Never infer membership from names, hard-coded ranks or admin permissions.
    memberships = new Map(); schedulePaint();
  });
  new MutationObserver(schedulePaint).observe(grid, {
    childList: true, subtree: true, attributes: true, attributeFilter: ['data-member-id']
  });
  schedulePaint();
}

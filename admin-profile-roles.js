import { auth, db } from './firebase-client.js';
import { watchAdmin, logActivity } from './admin-access.js';
import { MAX_PROFILE_ROLES, ROLE_TONES, roleNameKey, roleIdForName, roleState, subscribeRoles, paintRoleBadges } from './profile-roles.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { doc, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

export function setupAdminProfileRoles() {
  const panel = document.getElementById('adminProfileRoles');
  if (!panel) return;
  const $ = id => document.getElementById(id);
  const choices = $('adminRoleChoices'), save = $('adminSaveProfileRoles'), status = $('adminProfileRolesStatus');
  const createForm = $('adminRoleCreateForm'), createStatus = $('adminRoleCreateStatus');
  let allowed = false, epoch = 0, stopAdmin = () => {}, id = '', selected = new Set(), originalIds = [], dirty = false, busy = false;
  const normalized = ids => JSON.stringify([...ids].sort());
  function pickedMember() { return $('adminMemberId').value || ''; }
  function showStatus(message, problem = false) { status.textContent = message; status.classList.toggle('is-problem', problem); }
  function renderChoices() {
    const preview = $('adminProfileRolesPreview');
    paintRoleBadges(preview, [...selected].map(key => roleState.definitions.get(key)).filter(Boolean));
    if (!allowed || !id || !roleState.catalogLoaded || !roleState.assignmentsLoaded) { save.disabled = true; return; }
    const definitions = [...roleState.definitions.values()].sort((a, b) => a.name.localeCompare(b.name));
    const signature = JSON.stringify([definitions.map(role => [role.id, role.name, role.tone]), [...selected].sort(), busy]);
    if (choices.dataset.signature !== signature) {
      const focusedId = document.activeElement?.value;
      choices.dataset.signature = signature; choices.replaceChildren();
      for (const role of definitions) {
        const label = document.createElement('label'), input = document.createElement('input'), text = document.createElement('span');
        input.type = 'checkbox'; input.name = 'profileRole'; input.value = role.id; input.checked = selected.has(role.id);
        input.disabled = busy || (!input.checked && selected.size >= MAX_PROFILE_ROLES);
        text.textContent = role.name; label.append(input, text); choices.append(label);
      }
      if (focusedId) [...choices.querySelectorAll('input')].find(input => input.value === focusedId)?.focus();
    }
    save.disabled = busy || !dirty || Boolean(roleState.error);
  }
  function loadMember() {
    id = pickedMember(); dirty = false;
    panel.hidden = !allowed || !id;
    originalIds = [...(roleState.assignments.get(id)?.roleIds || [])]; selected = new Set(originalIds);
    showStatus(id ? 'Changes here apply only to public badges.' : '');
    renderChoices();
  }
  subscribeRoles(() => {
    if (!allowed) return;
    if (roleState.error) showStatus(roleState.error, true);
    if (!dirty) { originalIds = [...(roleState.assignments.get(id)?.roleIds || [])]; selected = new Set(originalIds); }
    renderChoices();
  });
  choices.addEventListener('change', event => {
    const input = event.target;
    if (!allowed || input.name !== 'profileRole') return;
    if (input.checked) selected.add(input.value); else selected.delete(input.value);
    dirty = normalized(selected) !== normalized(originalIds);
    showStatus(dirty ? 'Role changes are not saved yet.' : 'No role changes to save.'); renderChoices();
  });
  document.addEventListener('wsb:admin-profile-loaded', loadMember);
  $('adminMemberForm').addEventListener('reset', () => { id = ''; dirty = false; selected.clear(); panel.hidden = true; });
  // These controls save separately, so their unsaved state needs its own guard.
  const discard = () => !dirty || confirm('Discard unsaved profile-role changes?');
  $('adminMemberPicker').addEventListener('change', event => {
    if (!discard()) { event.target.value = id; event.stopImmediatePropagation(); }
  }, true);
  document.addEventListener('click', event => {
    const target = event.target.closest('a,button');
    if (!target || !dirty || !allowed) return;
    if ((target.tagName === 'A' && target.target !== '_blank') || /adminStartNew|signOut|adminSignOut/.test(target.id)) {
      if (!discard()) { event.preventDefault(); event.stopImmediatePropagation(); }
    }
  }, true);
  window.addEventListener('beforeunload', event => { if (allowed && dirty) { event.preventDefault(); event.returnValue = ''; } });
  save.addEventListener('click', async () => {
    if (!allowed || !auth.currentUser || !id || !dirty || busy) return;
    const memberId = id, version = epoch, next = [...selected], baseline = normalized(originalIds), user = auth.currentUser;
    busy = true; renderChoices(); showStatus('Saving profile roles…');
    try {
      await runTransaction(db, async transaction => {
        const ref = doc(db, 'memberRoles', memberId), current = await transaction.get(ref);
        if (version !== epoch || !allowed) throw new Error('Admin access changed. Sign in again.');
        if (normalized(current.data()?.roleIds || []) !== baseline) throw new Error('Another admin changed these roles. Select the member again to load their changes.');
        transaction.set(ref, { roleIds: next, updatedAt: serverTimestamp() });
        logActivity(db, transaction, user, 'member-roles-changed', 'memberRoles', memberId, next.map(key => roleState.definitions.get(key)?.name || key).join(', ') || 'All profile roles removed');
      });
      if (version !== epoch || id !== memberId || !allowed) return;
      originalIds = next; dirty = false;
      showStatus(next.length ? 'Profile roles saved. Public badges are updated.' : 'All profile roles removed.');
    } catch (error) { if (version === epoch && id === memberId) showStatus(error.message || 'Roles could not be saved.', true); }
    finally { busy = false; renderChoices(); }
  });
  createForm.addEventListener('submit', async event => {
    event.preventDefault(); if (!allowed || !auth.currentUser) return;
    const version = epoch, user = auth.currentUser, button = $('adminCreateRole');
    const name = $('adminNewRoleName').value.normalize('NFKC').trim().replace(/\s+/g, ' '), tone = $('adminNewRoleTone').value;
    if (name.length < 2 || name.length > 32) { createStatus.textContent = 'Use a role name between 2 and 32 characters.'; return; }
    if (['admin', 'administrator', 'website admin', 'admin (website access)'].includes(roleNameKey(name))) { createStatus.textContent = 'Admin is reserved for website access. Choose a display-role name.'; return; }
    if (!ROLE_TONES.includes(tone)) return;
    button.disabled = true; createStatus.textContent = 'Creating profile role…';
    try {
      const roleId = await roleIdForName(name);
      await runTransaction(db, async transaction => {
        const ref = doc(db, 'profileRoles', roleId), current = await transaction.get(ref);
        if (version !== epoch || !allowed) throw new Error('Admin access changed. Sign in again.');
        if (current.exists() || [...roleState.definitions.values()].some(role => roleNameKey(role.name) === roleNameKey(name))) throw new Error('A role with that name already exists.');
        transaction.set(ref, { name, tone, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        logActivity(db, transaction, user, 'profile-role-created', 'profileRoles', roleId, name);
      });
      if (version !== epoch || !allowed) return;
      createForm.reset(); createStatus.textContent = '“' + name + '” created. Select a member to assign it.';
    } catch (error) { if (version === epoch) createStatus.textContent = error.message || 'Role could not be created.'; }
    finally { button.disabled = false; }
  });
  onAuthStateChanged(auth, user => {
    stopAdmin(); const version = ++epoch; allowed = false; dirty = false; id = ''; selected.clear(); choices.replaceChildren(); panel.hidden = true;
    createForm.reset(); createStatus.textContent = ''; showStatus('');
    stopAdmin = watchAdmin(db, user, async isAdmin => {
      if (version !== epoch) return;
      if (allowed === isAdmin) return;
      allowed = isAdmin;
      if (!allowed) { dirty = false; selected.clear(); choices.replaceChildren(); panel.hidden = true; createForm.reset(); createStatus.textContent = ''; showStatus(''); return; }
      loadMember();
      // Idempotent starter role. Created only by an authorized administrator.
      try {
        await runTransaction(db, async transaction => {
          const ref = doc(db, 'profileRoles', 'bounty-hunter'), current = await transaction.get(ref);
          if (current.exists() || version !== epoch || !allowed) return;
          transaction.set(ref, { name: 'Bounty Hunter', tone: 'gold', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
          logActivity(db, transaction, user, 'profile-role-created', 'profileRoles', 'bounty-hunter', 'Bounty Hunter');
        });
      } catch (_) { if (version === epoch && allowed) createStatus.textContent = 'Starter role could not be prepared. Refresh to retry.'; }
    });
  });
}

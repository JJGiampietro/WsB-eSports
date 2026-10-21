// Membership is public presentation. Website administration is a private permission.
export const membershipLabels = Object.freeze({ member: 'Member', creator: 'Creator', management: 'Management', owner: 'Owner', hr: 'HR', developer: 'Developer' });
export const membershipRoles = Object.freeze(Object.keys(membershipLabels));
export function validAdminGrant(grant) {
  return Boolean(grant && (!Object.hasOwn(grant, 'enabled') || grant.enabled === true)
    && (!Object.hasOwn(grant, 'memberId') || (typeof grant.memberId === 'string' && grant.memberId.length > 0)));
}
export function hasWebsiteAdmin(access) {
  // Preserve pre-separation invitations/grants until an admin migrates the record.
  return typeof access?.websiteAdmin === 'boolean' ? access.websiteAdmin : access?.role === 'admin';
}
export function membershipRole(access) {
  return membershipRoles.includes(access?.role) ? access.role : 'member';
}

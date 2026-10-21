// Shared browser/server policy for the ONE visual-only Easter egg. This is not
// a user-selectable membership or a general exemption for Developer members.
(function (scope) {
  const isDisplayOnlyMember = id => id === 'ingraham';
  const policy = Object.freeze({
    isDisplayOnlyMember,
    membershipFor: id => isDisplayOnlyMember(id) ? 'developer' : null
  });
  scope.WsbDisplayOnly = policy;
  if (typeof module !== 'undefined') module.exports = policy;
})(typeof window === 'undefined' ? globalThis : window);

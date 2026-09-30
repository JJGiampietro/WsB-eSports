// Run once with the existing Firebase CLI administrator session. No keys are written.
const { configstore } = require('../bounties/node_modules/firebase-tools/lib/configstore');
const { getAccessToken } = require('../bounties/node_modules/firebase-tools/lib/auth');
(async () => {
  const token = await getAccessToken(configstore.get('tokens').refresh_token, ['https://www.googleapis.com/auth/cloud-platform']);
  async function api(url, method = 'GET', body) {
    const response = await fetch(url, {
      method, headers: { Authorization: 'Bearer ' + token.access_token, 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error(`${method} ${response.status}: ${await response.text()}`);
    return response.json();
  }
  const service = 'https://iam.googleapis.com/v1/projects/wsb-esports/serviceAccounts/wsb-hosting-deploy@wsb-esports.iam.gserviceaccount.com';
  const provider = 'https://iam.googleapis.com/v1/projects/999242676867/locations/global/workloadIdentityPools/github-actions/providers/wsb-repo';
  const policy = await api(service + ':getIamPolicy', 'POST', {});
  const principal = 'principalSet://iam.googleapis.com/projects/999242676867/locations/global/workloadIdentityPools/github-actions/attribute.repository_id/1365837312';
  let binding = policy.bindings.find(item => item.role === 'roles/iam.workloadIdentityUser' && !item.condition);
  if (!binding) policy.bindings.push(binding = { role: 'roles/iam.workloadIdentityUser', members: [] });
  if (!binding.members.includes(principal)) binding.members.push(principal);
  await api(service + ':setIamPolicy', 'POST', { policy });
  console.log('Canonical repository added to the deployment service account; other bindings preserved.');
  const current = await api(provider);
  await api(provider + '?updateMask=attributeMapping,attributeCondition', 'PATCH', {
    attributeMapping: { ...current.attributeMapping, 'attribute.repository_id': 'assertion.repository_id' },
    attributeCondition: "assertion.repository_id == '1365837312' && assertion.repository_owner_id == '327916067' && assertion.ref == 'refs/heads/main'",
  });
  const updated = await api(provider);
  console.log(JSON.stringify({ state: updated.state, attributeCondition: updated.attributeCondition }, null, 2));
})().catch(error => { console.error(error.message); process.exitCode = 1; });

const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
module.exports=async()=>{
  const filename=path.resolve(__dirname,'../../scripts/fetch-weekly-stats.js');
  const requireStats=require('node:module').createRequire(filename);
  const source=fs.readFileSync(filename,'utf8').replace(/\bmain\(\);?\s*$/,'');
  let apiCalls=0,fileWrites=0;
  const context=vm.createContext({
    require:name=>name==='fs'?new Proxy({}, {get(){return()=>{fileWrites++;throw Error('Unexpected stats file operation');};}}):requireStats(name),
    __dirname:path.dirname(filename),Buffer,URLSearchParams,AbortSignal,setTimeout,
    process:{env:{FORTNITE_API_KEY:'isolated-test-only',FIREBASE_SERVICE_ACCOUNT:'{"project_id":"demo-display-only"}'},exit(){throw Error('Unexpected exit');}},
    console:{log(){},warn(){},error(){}},
    fetch:async url=>{
      if(String(url).includes('fortnite-api.com')){apiCalls++;throw Error('Unexpected Fortnite request');}
      return {ok:true,json:async()=>({documents:['ingraham','real-developer'].map(id=>({name:'test/memberAccess/'+id,fields:{displayName:{stringValue:id},fortniteUsername:{stringValue:'ValidUsername'},rosterStatus:{stringValue:'pending'}}}))})};
    }
  });
  vm.runInContext(source+'\nfirebaseAccessToken=async()=>"isolated";globalThis.testApi={loadPendingRosterMembers,createStatsProfilePage,fetchPlayerStats};',context);
  const queue=await context.testApi.loadPendingRosterMembers();
  assert.deepEqual(Array.from(queue.pending,member=>member.id),['real-developer']);
  context.testApi.createStatsProfilePage('ingraham');
  await assert.rejects(context.testApi.fetchPlayerStats({id:'ingraham',username:'NeverFetch'}),/must never request Fortnite stats/);
  assert.equal(apiCalls,0);assert.equal(fileWrites,0);
  console.log('PASS: real stats worker excludes Ingraham even with a pending username; no API call or stats page, normal developers unaffected.');
};

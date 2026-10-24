import { appendFileSync } from 'node:fs';
export default function(pi) {
 let timer;const off=[];let polls=0;
 const log=data=>appendFileSync(process.env.COMPANION_TEST_LOG,JSON.stringify(data)+'\n');
 pi.on('session_start',(_e,ctx)=>{
  if(process.env.COMPANION_TEST_MODE==='sample')off.push(pi.events.on('subagents:rpc:v1:request',request=>{
   if(!['ping','status'].includes(request.method))throw Error('Mutation attempted');
   log({request:request.method});
   const state=++polls>2?'completed':'running';
   const data=request.method==='ping'?{capabilities:{activityStatus:{version:1}}}:{activity:{version:1,scope:'current-session',generatedAt:Date.now(),available:true,incomplete:false,omitted:{active:0,recent:0,children:0,scanTruncated:false},entries:[{key:'fixture-worker',agent:'SAMPLE-WORKER',state,activity:{tool:'read'},elapsedMs:state==='running'?1000:2000,usage:{input:20,output:5,source:'reported-own'}}]}};
   pi.events.emit(`subagents:rpc:v1:reply:${request.requestId}`,{version:1,requestId:request.requestId,success:true,data});
  }));
  off.push(pi.events.on('pi-minimal:footer:v1:register',request=>{
   if(request.owner!=='pi-agent-activity'||!request.result?.ok)return;
   const original=request.result.registration;
   request.result.registration={publish(snapshot){const result=original.publish(snapshot);log({publication:snapshot,result});return result},dispose(){original.dispose();log({disposed:true})}};
  }));
  timer=setTimeout(()=>ctx.shutdown(),3300);
 });
 pi.on('session_shutdown',()=>{clearTimeout(timer);for(const unsubscribe of off)unsubscribe()});
}

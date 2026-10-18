import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { setTimeout } from "node:timers/promises";
const suffix=randomBytes(6).toString("hex"), network=`qbuy-4a-${suffix}`, db=`${network}-db`, web=`${network}-web`, worker=`${network}-worker`;
const rollbackImage=process.argv[3];
if(rollbackImage && !/^qbuy:[a-zA-Z0-9._-]+$/.test(rollbackImage))throw new Error("LOCAL_ROLLBACK_IMAGE_REQUIRED");
const image=process.argv[2]; if(!image||!/^qbuy:[a-zA-Z0-9._-]+$/.test(image))throw new Error("LOCAL_IMAGE_REQUIRED");
const password=randomBytes(24).toString("hex");
const url=`postgresql://drill:${password}@${db}:5432/qbuy_staging`;
const env=["-e",`DATABASE_URL=${url}`,"-e","QBUY_ENV=staging","-e","APP_BASE_URL=https://staging.invalid","-e","LINE_MESSAGING_ENABLED=false"];
const created:string[]=[];let networkCreated=false;
function docker(args:string[],allowFail=false){const p=spawnSync("docker",args,{encoding:"utf8",windowsHide:true});if(!allowFail&&p.status!==0)throw new Error("CONTAINER_COMMAND_FAILED");return {status:p.status,out:p.stdout};}
async function eventually(check:()=>boolean|Promise<boolean>,label:string){for(let i=0;i<60;i++){if(await check()){console.log(JSON.stringify({check:label,result:"PASSED"}));return;}await setTimeout(1000);}throw new Error(label+"_TIMEOUT");}
async function status(path:string){try{return (await fetch(`http://127.0.0.1:3217${path}`,{redirect:"manual",signal:AbortSignal.timeout(8000)})).status;}catch{return 0;}}
try{
 docker(["network","create",network]);networkCreated=true;
 docker(["run","-d","--name",db,"--network",network,"-e","POSTGRES_DB=qbuy_staging","-e","POSTGRES_USER=drill","-e",`POSTGRES_PASSWORD=${password}`,"postgres:17"]);created.push(db);
 await eventually(()=>docker(["exec",db,"pg_isready","-U","drill","-d","qbuy_staging"],true).status===0,"isolated-postgres-start");
 docker(["run","--rm","--network",network,...env,image,"npx","prisma","migrate","deploy"]);
 console.log(JSON.stringify({check:"22-migrations-container",result:"PASSED"}));
 // Failed migration marker only in this disposable DB; migration command must stop.
 const failedId=crypto.randomUUID();
 docker(["exec",db,"psql","-U","drill","-d","qbuy_staging","-c",`INSERT INTO "_prisma_migrations" (id,checksum,migration_name,started_at,applied_steps_count) VALUES ('${failedId}','synthetic','20990101000000_wrong_version',now(),0)`]);
 if(docker(["run","--rm","--network",network,...env,image,"npx","prisma","migrate","deploy"],true).status===0)throw new Error("WRONG_MIGRATION_NOT_BLOCKED");
 docker(["exec",db,"psql","-U","drill","-d","qbuy_staging","-c",`DELETE FROM "_prisma_migrations" WHERE id='${failedId}'`]);
 console.log(JSON.stringify({check:"failed-migration-blocks-deployment",result:"PASSED"}));
 docker(["run","-d","--name",web,"--network",network,"-p","127.0.0.1:3217:3000",...env,image]);created.push(web);
 await eventually(async()=>await status("/api/health/ready")===200,"web-ready");
 if(await status("/")!==503||await status("/api/auth/line/start")!==503)throw new Error("GATE_FAILED");
 console.log(JSON.stringify({check:"staging-default-gates",result:"PASSED"}));
 docker(["run","-d","--name",worker,"--no-healthcheck","--network",network,...env,image,"npm","run","worker","--","checkouts"]);created.push(worker);
 const heartbeat=()=>docker(["exec",db,"psql","-U","drill","-d","qbuy_staging","-Atc",`SELECT count(*) FROM "WorkerHeartbeat" WHERE name='checkouts' AND "lastSuccessAt">now()-interval '20 seconds'`],true).out.trim()==="1";
 await eventually(heartbeat,"worker-heartbeat");
 docker(["stop","--time","2",db]);
 await eventually(async()=>await status("/api/health/ready")===503,"database-outage-readiness-503");
 if(await status("/api/health/live")!==200)throw new Error("LIVENESS_FAILED");
 docker(["start",db]);await eventually(async()=>await status("/api/health/ready")===200,"database-restart-readiness-recovery");
 docker(["kill",worker]);docker(["exec",db,"psql","-U","drill","-d","qbuy_staging","-c",`UPDATE "WorkerHeartbeat" SET "lastSuccessAt"=to_timestamp(0) WHERE name='checkouts'`]);docker(["start",worker]);await eventually(heartbeat,"worker-kill-restart-recovery");
 const latencies:number[]=[];const start=Date.now();
 await Promise.all(Array.from({length:20},async()=>{const t=Date.now();if(await status("/api/health/ready")!==200)throw new Error("LOAD_FAILED");latencies.push(Date.now()-t);}));
 latencies.sort((a,b)=>a-b);console.log(JSON.stringify({check:"20-concurrent-ready-requests",result:"PASSED",elapsedMs:Date.now()-start,p95Ms:latencies[18],scope:"local health endpoint only, not transaction capacity"}));
 if(rollbackImage){
  docker(["stop","--time","2",web]);
  const old=`${network}-rollback`;
  docker(["run","-d","--name",old,"--network",network,"-p","127.0.0.1:3217:3000",...env,rollbackImage]);created.push(old);
  await eventually(async()=>await status("/")===200,"baseline-app-on-additive-schema-rollback");
  if(await status("/admin/login")!==200)throw new Error("ROLLBACK_LOGIN_FAILED");
 }
 console.log(JSON.stringify({result:"PASSED",scope:"local isolated staging container drill"}));
}catch(error){console.error(error instanceof Error?error.message:"DRILL_FAILED");process.exitCode=1;}
finally{for(const name of created.reverse())docker(["rm","-f",name],true);if(networkCreated)docker(["network","rm",network],true);}

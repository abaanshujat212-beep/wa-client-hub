const {inQuietHours}=require("./policy");

class CampaignWorker {
  constructor({repository,openWaRepository,openWaClient,redis,events,workspaceLimit=20,numberLimit=10,pollMs=1000}){Object.assign(this,{repository,openWaRepository,openWaClient,redis,events,workspaceLimit,numberLimit,pollMs});this.timer=null;this.running=false;}
  start(){if(this.timer||!this.redis)return;this.timer=setInterval(()=>this.tick().catch(()=>{}),this.pollMs);this.timer.unref?.();}
  stop(){if(this.timer)clearInterval(this.timer);this.timer=null;}
  async throttle(recipient){const minute=Math.floor(Date.now()/60000);const wk=`campaign:rate:workspace:${recipient.workspace_id}:${minute}`;const nk=`campaign:rate:number:${recipient.whatsapp_number_id}:${minute}`;const result=await this.redis.multi().incr(wk).expire(wk,120,"NX").incr(nk).expire(nk,120,"NX").exec();return Number(result[0])<=this.workspaceLimit&&Number(result[2])<=this.numberLimit;}
  async tick(){if(this.running||!this.redis?.isReady)return false;this.running=true;try{const recipient=await this.repository.claim();if(!recipient)return false;
    const campaign=await this.repository.get([recipient.workspace_id],recipient.campaign_id);if(!campaign||campaign.status!=="running")return this.repository.retry(recipient,"campaign_paused",1000);
    if(inQuietHours(new Date(),recipient.quiet_start,recipient.quiet_end))return this.repository.retry(recipient,"quiet_hours",1000);
    const eligibility=await this.repository.eligibility(recipient);if(eligibility.suppressed){await this.repository.transition(recipient,"suppressed","suppression_match");return true;}if(!eligibility.consented){await this.repository.transition(recipient,"unconsented","valid_consent_missing");return true;}
    if(!(await this.throttle(recipient))){await this.repository.retry(recipient,"rate_limited",1000);return true;}
    const connection=await this.openWaRepository.connectionForNumber(recipient.workspace_id,recipient.whatsapp_number_id);if(!connection?.automation_enabled){await this.repository.retry(recipient,"automation_not_available");return true;}
    try{const to=recipient.phone_e164.replace(/\D/g,"")+"@c.us";const externalMessageId=await this.openWaClient.sendText(to,recipient.personalized_body);const message=await this.openWaRepository.recordOutbound({connection,to,body:recipient.personalized_body,type:"text",origin:"campaign",externalMessageId:String(externalMessageId||"")||null,idempotencyKey:`campaign:${recipient.id}`});await this.repository.transition(recipient,"sent",null,{externalMessageId:String(externalMessageId||""),messageId:message.id});this.events?.publish(recipient.workspace_id,"campaign.recipient.sent",{campaignId:recipient.campaign_id,recipientId:recipient.id});return true;}catch(error){await this.repository.retry(recipient,error.message);return true;}
  }finally{this.running=false;}}
}
module.exports={CampaignWorker};

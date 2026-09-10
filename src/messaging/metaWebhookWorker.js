class MetaWebhookWorker{
 constructor({repository,intervalMs=1000,batchSize=10,logger=console}){if(typeof repository?.claim!=='function'||typeof repository?.processReceipt!=='function')throw new TypeError('Meta webhook repository is required');this.repository=repository;this.intervalMs=Math.max(250,Number(intervalMs)||1000);this.batchSize=Math.min(50,Math.max(1,Number(batchSize)||10));this.logger=logger;this.timer=null;this.running=false;}
 async tick(){if(this.running)return;this.running=true;try{const receipts=await this.repository.claim(this.batchSize);for(const receipt of receipts){try{await this.repository.processReceipt(receipt);}catch(error){await this.repository.fail(receipt,error);this.logger.error?.('Meta webhook receipt processing failed',{receiptId:receipt.id,code:error?.code||'META_WEBHOOK_PROCESSING_FAILED'});}}}catch{this.logger.error?.('Meta webhook worker poll failed');}finally{this.running=false;}}
 start(){if(this.timer)return;void this.tick();this.timer=setInterval(()=>void this.tick(),this.intervalMs);this.timer.unref?.();}
 stop(){if(this.timer)clearInterval(this.timer);this.timer=null;}
}
module.exports={MetaWebhookWorker};

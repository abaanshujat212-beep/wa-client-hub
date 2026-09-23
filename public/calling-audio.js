(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.WaCallingAudio=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  class AudioSession {
    constructor({mediaDevices,PeerConnection,MediaStreamClass,audio,onState=()=>{},iceServers=[]}){Object.assign(this,{mediaDevices,PeerConnection,MediaStreamClass,audio,onState,iceServers});this.pc=null;this.stream=null;this.generation=0;this.cancelGather=null;}
    async prepare(deviceId){
      this.close();const gen=this.generation;
      if(!this.mediaDevices?.getUserMedia||!this.PeerConnection)throw new Error('This browser does not support secure browser calling. Open the app in Chrome or Edge over HTTPS.');
      let stream;
      try{stream=await this.mediaDevices.getUserMedia({audio:deviceId?{deviceId:{exact:deviceId},echoCancellation:true,noiseSuppression:true}:{echoCancellation:true,noiseSuppression:true},video:false});}
      catch(error){throw new Error(error.name==='NotAllowedError'?'Microphone access was blocked. Allow microphone access, or open calling in a new tab if you are inside GHL.':'Could not open the microphone. Check your audio device.');}
      if(gen!==this.generation){stream.getTracks().forEach(t=>t.stop());throw new Error('Call setup cancelled');}
      this.stream=stream;
      try{
        const pc=this.pc=new this.PeerConnection({iceServers:this.iceServers,bundlePolicy:'max-bundle'});
        stream.getTracks().forEach(t=>pc.addTrack(t,stream));
        const caps=globalThis.RTCRtpSender?.getCapabilities?.('audio');
        if(caps)for(const t of pc.getTransceivers()){const opus=caps.codecs.filter(c=>c.mimeType.toLowerCase()==='audio/opus');if(opus.length&&t.setCodecPreferences)t.setCodecPreferences(opus);}
        pc.ontrack=event=>{if(this.pc!==pc)return;this.audio.srcObject=event.streams?.[0]||new this.MediaStreamClass([event.track]);this.audio.play().catch(()=>this.onState('playback-blocked'));};
        pc.onconnectionstatechange=()=>{if(this.pc===pc)this.onState(pc.connectionState);};
      }catch(error){this.close();throw error;}
    }
    gather(pc){return new Promise((resolve,reject)=>{
      if(pc.iceGatheringState==='complete')return resolve();
      const finish=error=>{clearTimeout(timer);pc.removeEventListener('icegatheringstatechange',changed);this.cancelGather=null;error?reject(error):resolve();};
      const changed=()=>{if(pc.iceGatheringState==='complete')finish();};
      const timer=setTimeout(()=>finish(new Error('Network negotiation timed out. Check your network before trying again.')),15000);
      this.cancelGather=()=>finish(new Error('Call setup cancelled'));pc.addEventListener('icegatheringstatechange',changed);
    });}
    async localDescription(remoteOffer){
      const pc=this.pc;if(!pc)throw new Error('Microphone is not ready');
      try{if(remoteOffer)await pc.setRemoteDescription({type:'offer',sdp:remoteOffer});
        await pc.setLocalDescription(remoteOffer?await pc.createAnswer():await pc.createOffer());await this.gather(pc);
        if(this.pc!==pc)throw new Error('Call setup cancelled');return pc.localDescription.sdp;
      }catch(error){this.close();throw error;}
    }
    async answer(sdp){if(this.pc&&!this.pc.currentRemoteDescription)await this.pc.setRemoteDescription({type:'answer',sdp});}
    mute(value){this.stream?.getAudioTracks().forEach(t=>{t.enabled=!value;});}
    close(){this.generation++;this.cancelGather?.();this.pc?.close();this.pc=null;this.stream?.getTracks().forEach(t=>t.stop());this.stream=null;if(this.audio)this.audio.srcObject=null;}
  }
  return {AudioSession};
});

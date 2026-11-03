// Format parsing is bounded in a disposable worker. It is not an OS sandbox.
export const careAudioWorker = String.raw`
const {parentPort,workerData}=require('node:worker_threads');
const {pathToFileURL}=require('node:url');
function webmDuration(bytes){
  let scale=1000000,maximum=0,blocks=0,nodes=0;
  function vint(offset,identifier=false){
    if(offset>=bytes.length||bytes[offset]===0)throw Error('ebml');
    let length=1,mask=128;while(!(bytes[offset]&mask)){length++;mask>>=1;if(length>8)throw Error('ebml');}
    if(identifier&&length>4||offset+length>bytes.length)throw Error('ebml');
    let value=BigInt(identifier?bytes[offset]:bytes[offset]&(mask-1));for(let i=1;i<length;i++)value=(value<<8n)|BigInt(bytes[offset+i]);
    const unknown=!identifier&&value===((1n<<BigInt(length*7))-1n);
    if(!unknown&&value>BigInt(Number.MAX_SAFE_INTEGER))throw Error('ebml');return {value:Number(value),length,unknown};
  }
  function integer(start,end){if(end-start>8)throw Error('integer');let value=0;for(let i=start;i<end;i++)value=value*256+bytes[i];if(!Number.isSafeInteger(value))throw Error('integer');return value;}
  function walk(start,end,depth,inCluster=false,clusterBase=0){
    if(depth>12)throw Error('nesting');let cursor=start,clusterTime=clusterBase;
    while(cursor<end){if(++nodes>50000)throw Error('elements');const before=cursor,id=vint(cursor,true);cursor+=id.length;const size=vint(cursor);cursor+=size.length;const limit=size.unknown?end:cursor+size.value;
      if(limit>end||limit<cursor)throw Error('length');
      if(inCluster&&id.value===0x1f43b675)return before;
      if([0x18538067,0x1549a966,0x1f43b675,0xa0].includes(id.value)){
        const stopped=walk(cursor,limit,depth+1,id.value===0x1f43b675||inCluster,id.value===0x1f43b675?0:clusterTime);cursor=size.unknown?stopped:limit;
      }else{
        if(size.unknown)throw Error('unknown length');
        if(id.value===0x2ad7b1){scale=integer(cursor,limit);if(scale<1||scale>1000000000)throw Error('scale');}
        if(inCluster&&id.value===0xe7)clusterTime=integer(cursor,limit);
        if(inCluster&&(id.value===0xa3||id.value===0xa1)){
          const track=vint(cursor);const at=cursor+track.length;
          if(track.value!==1||at+4>limit||bytes[at+2]&6)throw Error('audio track');
          let relative=bytes[at]*256+bytes[at+1];if(relative>=32768)relative-=65536;
          const toc=bytes[at+3],configuration=toc>>3,code=toc&3;
          const frame=configuration<12?[10,20,40,60][configuration&3]:configuration<16?[10,20][configuration&1]:[2.5,5,10,20][configuration&3];
          const count=code===0?1:code===3?(at+4<limit?bytes[at+4]&63:0):2;
          const duration=frame*count;if(!count||duration>120)throw Error('packet');
          maximum=Math.max(maximum,(clusterTime+relative)*scale/1000000+duration);blocks++;
        }cursor=limit;
      }
      if(cursor<=before)throw Error('progress');
    }return cursor;
  }
  walk(0,bytes.length,0);if(!blocks||!Number.isFinite(maximum)||maximum<=0||maximum>120500)throw Error('duration');return maximum;
}
async function run(){
  const bytes=new Uint8Array(workerData.bytes);
  const {fileTypeFromBuffer}=await import(pathToFileURL(workerData.fileTypeModule).href);
  const type=await fileTypeFromBuffer(bytes);
  if(!type||!['webm','m4a','mp4','ogg','opus'].includes(type.ext))throw Error('format');
  const {parseBuffer}=await import(pathToFileURL(workerData.metadataModule).href);
  const metadata=await parseBuffer(bytes,{mimeType:type.mime,size:bytes.length},{duration:true,skipCovers:true,includeChapters:false});
  const format=metadata.format,tracks=format.trackInfo||[];
  if(tracks.some(track=>track.type===1)||!/opus|aac|vorbis/i.test(format.codec||'')||!format.sampleRate||format.sampleRate>192000||!format.numberOfChannels||format.numberOfChannels>2)throw Error('audio');
  const supplied=Number(workerData.durationMs);
  const parsed=type.ext==='webm'?webmDuration(bytes):Number(format.duration)*1000;
  if(!Number.isFinite(supplied)||supplied<200||supplied>120000)throw Error('duration');
  if(!Number.isFinite(parsed)||parsed<1||parsed>120500||Math.abs(parsed-supplied)>5000)throw Error('duration');
  const mime=['webm'].includes(type.ext)?'audio/webm':['ogg','opus'].includes(type.ext)?'audio/ogg':'audio/mp4';
  parentPort.postMessage({mime,durationMs:Math.min(120000,Math.round(Number.isFinite(parsed)?parsed:supplied)),extension:mime==='audio/webm'?'webm':mime==='audio/ogg'?'ogg':'m4a'});
}
run().catch(()=>parentPort.postMessage({error:true}));
`;

var sharp=require("sharp");
var fs=require("fs");
var path=require("path");

var SIZE=256,CX=128,CY=128,R=100,SW=8,DR=10;

function d2r(d){return d*Math.PI/180;}
function ptc(cx,cy,r,a){var ar=d2r(a);return{x:cx+r*Math.cos(ar),y:cy+r*Math.sin(ar)};}

var sa=-90,sd=270,ea=sa+sd;
var S=ptc(CX,CY,R,sa),E=ptc(CX,CY,R,ea);
var lf=sd>180?1:0;
var ap="M "+S.x+" "+S.y+" A "+R+" "+R+" 0 "+lf+" 1 "+E.x+" "+E.y;

var svg='<svg xmlns="http://www.w3.org/2000/svg" width="'+SIZE+'" height="'+SIZE+'" viewBox="0 0 '+SIZE+' '+SIZE+'">'+
'<path d="'+ap+'" fill="none" stroke="#ffffff" stroke-width="'+SW+'" stroke-linecap="round"/>'+
'<circle cx="'+S.x+'" cy="'+S.y+'" r="'+DR+'" fill="#ffffff"/>'+
'</svg>';

console.log("SVG:",svg);

async function genPng(sz,sv){
  return sharp(Buffer.from(sv),{density:300})
    .resize(sz,sz,{fit:"contain",background:{r:0,g:0,b:0,alpha:0}})
    .png().toBuffer();
}

function buildIco(pb,sz){
  var n=pb.length;
  var off=6+16*n;
  var h=Buffer.alloc(6);
  h.writeUInt16LE(0,0);h.writeUInt16LE(1,2);h.writeUInt16LE(n,4);
  var dirs=[];
  for(var i=0;i<n;i++){
    var e=Buffer.alloc(16);
    var s=sz[i];
    e.writeUInt8(s>=256?0:s,0);
    e.writeUInt8(s>=256?0:s,1);
    e.writeUInt8(0,2);e.writeUInt8(0,3);
    e.writeUInt16LE(1,4);e.writeUInt16LE(32,6);
    e.writeUInt32LE(pb[i].length,8);
    e.writeUInt32LE(off,12);
    off+=pb[i].length;
    dirs.push(e);
  }
  return Buffer.concat([h].concat(dirs).concat(pb));
}

async function main(){
  var od=__dirname;
  var p256=await genPng(256,svg);
  var pp=path.join(od,"icon.png");
  fs.writeFileSync(pp,p256);
  console.log("Written: "+pp+" ("+p256.length+" bytes)");
  var icoSizes=[16,32,48,64,128,256];
  var pbs=[];
  for(var z=0;z<icoSizes.length;z++){
    var buf=await genPng(icoSizes[z],svg);
    pbs.push(buf);
    console.log("  ICO "+icoSizes[z]+"x"+icoSizes[z]+": "+buf.length+" bytes");
  }
  var ib=buildIco(pbs,icoSizes);
  var ip=path.join(od,"icon.ico");
  fs.writeFileSync(ip,ib);
  console.log("Written: "+ip+" ("+ib.length+" bytes)");
  console.log("Done!");
}

main().catch(function(e){console.error(e);process.exit(1);});

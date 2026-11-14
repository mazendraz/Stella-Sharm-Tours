import subprocess,sys,os
D=os.path.expanduser('~/mnt/Downloads/');O=os.path.expanduser('~/mnt/stella-project-kit/assets/video-stock/')
REEF=D+'12105563_3840_2160_25fps.mp4';PYR=D+'10719349-uhd_3840_2160_24fps.mp4';SUN=D+'14627754_3840_2160_30fps.mp4'
CAM1=D+'15128177_3840_2160_30fps.mp4';CAM2=D+'12747111_3840_2160_24fps.mp4';RISE=D+'14026741_2160_3840_30fps.mp4'
TREK=D+'4173975-hd_1920_1080_30fps.mp4';STC=D+'4174093-hd_1920_1080_30fps (1).mp4';MTN=D+'9424565-hd_1920_1080_30fps.mp4'
G={'none':'null','petra':"crop=1600:900:0:70,curves=all='0/0 0.75/0.72 1/0.93',eq=contrast=1.06:gamma=1.04,vibrance=intensity=0.25,colorbalance=rh=0.03:rm=0.02:bh=-0.03",'sea':"eq=contrast=1.08:gamma=1.05:brightness=0.02,vibrance=intensity=0.25,colorbalance=bs=0.02:gs=0.02",
 'haze':"eq=contrast=1.22:gamma=0.97:saturation=1.3:brightness=-0.015,colorbalance=rm=0.05:gm=0.01:bm=-0.05:rh=0.03:bh=-0.03,vibrance=intensity=0.2",
 'warm':"eq=contrast=1.07:gamma=1.03:brightness=0.01,vibrance=intensity=0.22,colorbalance=rh=0.03:bh=-0.03",
 'rise':"eq=gamma=1.16:contrast=1.03:brightness=0.025,vibrance=intensity=0.25,colorbalance=rs=0.02:bs=0.01:rh=0.03:bh=-0.03",
 'mtn':"eq=contrast=1.08:gamma=1.03:brightness=0.01,vibrance=intensity=0.25,colorbalance=rm=0.03:bm=-0.02:bh=0.01"}
X=0.5
VID=os.path.expanduser('~/mnt/stella-project-kit/assets/video/')
J={
'stock-hero-egypt':((2560,1440),[(CAM1,0,4.5,1,'warm'),(PYR,66,74,2,'haze'),(REEF,4,8.5,1,'sea'),(MTN,2,6,1,'mtn'),(SUN,0,4.5,1,'warm')],1.5),
'stock-giza-camels':((2560,1440),[(CAM1,0,5.5,1,'warm'),(CAM2,3,9,1,'warm')],2),
'stock-mount-sinai-sunrise':((1440,2560),[(RISE,0,24,2,'rise')],6),
'stock-saint-catherine':((1920,1080),[(STC,0,2.6,1,'mtn'),(STC,4,6.5,1,'mtn'),(STC,8.8,11,1,'mtn'),(TREK,0,4,1,'mtn')],1),
'stock-giza-pyramids-aerial':((2560,1440),[(PYR,52,64,1.5,'haze'),(PYR,74,86,1.5,'haze')],2),
'stock-sea-boat':((1920,1080),[(os.path.expanduser('~/mnt/stella-project-kit/assets/_backup-v1/video-stock/stock-sea-quad-pyramids-h.mp4'),0,4.25,1,'sea')],1.5),
'hero-history-v':((1080,1920),[(CAM1,0.5,4.5,1,'warm'),(PYR,66,74,2,'haze'),(VID+'cairo-citadel-mosque-v.mp4',1.0,5.5,1,'none'),(VID+'coptic-cairo-v.mp4',0.35,1.45,1,'none'),(VID+'coptic-cairo-v.mp4',10.4,12.2,1,'none'),(VID+'coptic-cairo-v.mp4',12.6,14.3,1,'none')],1.5),
'stock-petra-treasury':((1920,1080),[(D+'pexels-4253642-petra.mp4',0,16.5,1,'petra')],5),
'stock-sharm-sunset':((2560,1440),[(SUN,0,11.9,1,'warm')],1),
'stock-red-sea-reef':((2560,1440),[(REEF,2,12,1,'sea')],3),
}
for name in sys.argv[1:]:
  (W,H),segs,pt=J[name];ins=[];fc=[];lab='';cum=0
  srcs=list(dict.fromkeys(s[0] for s in segs))
  for k,(f,a,b,sp,g) in enumerate(segs):
    idx=srcs.index(f);d=(b-a)/sp
    fc.append(f"[{idx}:v]trim={a}:{b},setpts=(PTS-STARTPTS)/{sp},fps=30,scale={W}:{H}:force_original_aspect_ratio=increase:flags=lanczos,crop={W}:{H},setsar=1,format=yuv420p,{G[g]},settb=AVTB[s{k}]")
    if k==0: lab='s0';cum=d;continue
    fc.append(f"[{lab}][s{k}]xfade=transition=fade:duration={X}:offset={cum-X:.3f}[j{k}]");cum+=d-X;lab=f'j{k}'
  cmd=['ffmpeg','-v','error','-y']
  for s in srcs: cmd+=['-i',s]
  OD=VID if not name.startswith('stock-') else O
  out=OD+name+'.mp4'
  cmd+=['-filter_complex',';'.join(fc),'-map',f'[{lab}]','-an','-c:v','libx264','-preset','medium','-crf','21','-pix_fmt','yuv420p','-movflags','+faststart',out]
  r=subprocess.run(cmd,capture_output=True,text=True)
  if r.returncode: print(name,'ERR',r.stderr[-500:]);continue
  subprocess.run(['ffmpeg','-v','error','-y','-ss',str(pt),'-i',out,'-frames:v','1','-vf','scale=iw/2:-2','-q:v','3',(VID+'posters/' if OD==VID else O)+name+'.jpg'])
  print(f"{name}: {cum:.1f}s {os.path.getsize(out)//1024}KB",flush=True)

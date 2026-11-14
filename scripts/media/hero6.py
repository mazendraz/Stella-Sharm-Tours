# 6-second homepage hero clips: one horizontal (desktop + collection page) and
# one vertical (phones) per collection, each framed for its own shape.
import subprocess,sys,os
D=os.path.expanduser('~/mnt/Downloads/');R=os.path.expanduser('~/mnt/stella-project-kit/assets/')
VS=R+'video-stock/';VC=R+'video/'
REEF=D+'12105563_3840_2160_25fps.mp4';PYR=D+'10719349-uhd_3840_2160_24fps.mp4';SUN=D+'14627754_3840_2160_30fps.mp4'
CAM1=D+'15128177_3840_2160_30fps.mp4';MTN=D+'9424565-hd_1920_1080_30fps.mp4';BOAT=D+'13413450_2560_1440_30fps.mp4'
QUAD=D+'14945991_2560_1440_25fps.mp4';PETRA=D+'pexels-4253642-petra.mp4'
CANYON=VC+'coloured-canyon-v.mp4';BQ=VC+'bedouin-quad-v.mp4'
G={'none':'null',
 'sea':"eq=contrast=1.08:gamma=1.05:brightness=0.02,vibrance=intensity=0.25,colorbalance=bs=0.02:gs=0.02",
 'haze':"eq=contrast=1.22:gamma=0.97:saturation=1.3:brightness=-0.015,colorbalance=rm=0.05:gm=0.01:bm=-0.05:rh=0.03:bh=-0.03,vibrance=intensity=0.2",
 'warm':"eq=contrast=1.07:gamma=1.03:brightness=0.01,vibrance=intensity=0.22,colorbalance=rh=0.03:bh=-0.03",
 'mtn':"eq=contrast=1.08:gamma=1.03:brightness=0.01,vibrance=intensity=0.25,colorbalance=rm=0.03:bm=-0.02:bh=0.01",
 'dusk':"eq=gamma=1.12:contrast=1.14:brightness=0.0:saturation=1.15,vibrance=intensity=0.28,colorbalance=rh=0.03:rm=0.02:bh=-0.03",
 'petra':"curves=all='0/0 0.75/0.72 1/0.93',eq=contrast=1.06:gamma=1.04,vibrance=intensity=0.25,colorbalance=rh=0.03:rm=0.02:bh=-0.03"}
X=0.4
# segment: (file, start, end, speed, grade, vertical focal x 0..1, h_crop or None)
PETRA_H='crop=1600:900:0:70'
J={
'private':[(BOAT,0,5.0,0.85,'sea',0.38,None)],
'history':[(CAM1,0.5,3.7,1,'warm',0.6,None),(PYR,66,72.4,2,'haze',0.47,None)],
'sea':[(REEF,4,10,1,'sea',0.62,None)],
'desert':[(QUAD,3,9,1,'dusk',0.5,'crop=iw/1.6:ih/1.6:iw*0.2:ih*0.36')],
'desert-v':[(CANYON,3.5,6.7,1,'none',0.5,None),(BQ,0,3.2,1,'none',0.5,None)],
'relax':[(SUN,0,6,1,'warm',0.26,None)],
'beyond':[(PETRA,2,8,1,'petra',0.2,PETRA_H)],
'all':[(PYR,52,56.4,2,'haze',0.47,None),(BOAT,1.5,3.7,1,'sea',0.42,None),(MTN,2,4.2,1,'mtn',0.6,None)],
}
def build(name,orient):
  segs=J[name]
  W,H=(2560,1440) if orient=='h' else (1080,1920)
  srcs=list(dict.fromkeys(s[0] for s in segs));fc=[];lab='';cum=0
  for k,(f,a,b,sp,g,fx,hc) in enumerate(segs):
    i=srcs.index(f);d=(b-a)/sp
    if orient=='h':
      frame=(hc+',' if hc else '')+f"scale={W}:{H}:force_original_aspect_ratio=increase:flags=lanczos,crop={W}:{H}"
    else:
      frame=f"crop='min(iw,ih*9/16)':ih:'(iw-min(iw,ih*9/16))*{fx}':0,scale={W}:{H}:flags=lanczos"
    fc.append(f"[{i}:v]trim={a}:{b},setpts=(PTS-STARTPTS)/{sp},fps=30,{frame},setsar=1,format=yuv420p,{G[g]},settb=AVTB[s{k}]")
    if k==0: lab='s0';cum=d;continue
    fc.append(f"[{lab}][s{k}]xfade=transition=fade:duration={X}:offset={cum-X:.3f}[j{k}]");cum+=d-X;lab=f'j{k}'
  # exactly 6 s, with a short fade-in so slides blend in softly
  fc.append(f"[{lab}]trim=0:6,setpts=PTS-STARTPTS[out]")
  base=name.replace('-v','')
  od=VC if name=='desert-v' else VS
  out=od+f'hero6-{base}-{orient}.mp4'
  cmd=['ffmpeg','-v','error','-y']
  for s in srcs: cmd+=['-i',s]
  cmd+=['-filter_complex',';'.join(fc),'-map','[out]','-an','-c:v','libx264','-preset','medium','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',out]
  r=subprocess.run(cmd,capture_output=True,text=True)
  if r.returncode: print(name,orient,'ERR',r.stderr[-400:]);return
  subprocess.run(['ffmpeg','-v','error','-y','-ss','2','-i',out,'-frames:v','1','-vf','scale=iw/2:-2','-q:v','3',out[:-4]+'.jpg'])
  print(f"{os.path.basename(out)} {cum:.1f}s→6s {os.path.getsize(out)//1024}KB",flush=True)
for arg in sys.argv[1:]:
  n,o=arg.rsplit(':',1); build(n,o)

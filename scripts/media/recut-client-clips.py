import subprocess,sys,os
R=os.path.expanduser('~/mnt/stella-project-kit/assets')
A=R+'/video/';S=R+'/video-stock/';O=R+'/video-v2/';os.makedirs(O+'posters',exist_ok=True)
G={'D':"vibrance=intensity=0.10,eq=contrast=1.04:gamma=1.03:brightness=0.008",
   'S':"eq=brightness=0.02:contrast=1.06:gamma=1.07,vibrance=intensity=0.24,colorbalance=bs=0.03:gs=0.012:rh=0.02:bh=-0.01",
   'I':"vibrance=intensity=0.16,eq=contrast=1.05:gamma=1.03:brightness=0.01,colorbalance=rh=0.035:gh=0.01:bh=-0.035:bs=0.02"}
X=0.3
J=[ # name, src, [(a,b,grade)], poster_time_in_output
('hero-history-v',A+'hero-history-v.mp4',[(0,8.5,'D'),(8.5,14.0,'I')],2),
('hero-all-v',A+'hero-all-v.mp4',[(0,3.4,'D'),(4.7,8.0,'S'),(8.0,11.3,'D'),(16.1,20.1,'D')],1.5),
('hero-desert-v',A+'hero-desert-v.mp4',[(0,1.4,'D'),(2.6,8.1,'D'),(9.2,13.4,'D'),(14.6,16.7,'D')],2.5),
('reef-snorkel-v',A+'reef-snorkel-v.mp4',[(1.6,4.9,'S')],1.5),
('reef-underwater-h',A+'reef-underwater-h.mp4',[(0,4.25,'S')],1.5),
('bedouin-quad-v',A+'bedouin-quad-v.mp4',[(0,2.5,'D'),(3.5,4.5,'D'),(5.5,7.0,'D')],0.5),
('desert-camel-v',A+'desert-camel-v.mp4',[(0,2.0,'D'),(5.0,5.86,'D')],0.8),
('desert-jeep-v',A+'desert-jeep-v.mp4',[(0,1.4,'D'),(2.6,7.06,'D')],0.5),
('giza-camel-ride-v',A+'giza-camel-ride-v.mp4',[(1.5,11.16,'D')],3),
('cairo-citadel-mosque-v',A+'cairo-citadel-mosque-v.mp4',[(1.5,15.3,'I')],2.5),
('coptic-cairo-v',A+'coptic-cairo-v.mp4',[(0,1.5,'I'),(3.9,14.9,'I'),(15.6,18.0,'I')],11),
('sea-hero-h',S+'stock-sea-quad-pyramids-h.mp4',[(0,4.25,'S')],1.5),
('coloured-canyon-v',A+'coloured-canyon-v.mp4',[(0,10.6,'D')],4.5),
('giza-pyramids-v',A+'giza-pyramids-v.mp4',[(0,10.83,'D')],2),
('jerusalem-dome-v',A+'jerusalem-dome-v.mp4',[(0,9.4,'I')],4),
('petra-treasury-v',A+'petra-treasury-v.mp4',[(0,2.83,'D')],1),
('stock-giza-carriage-h',S+'stock-giza-carriage-h.mp4',[(0,7.0,'D')],3),
]
only=sys.argv[1:]
for name,src,segs,pt in J:
  if only and name not in only: continue
  fc=[];prev=None;cum=0;lab=''
  for i,(a,b,g) in enumerate(segs):
    fc.append(f"[0:v]trim={a}:{b},setpts=PTS-STARTPTS,fps=30,format=yuv420p,{G[g]},settb=AVTB[s{i}]")
    d=b-a
    if i==0: lab='s0';cum=d;continue
    contiguous=abs(segs[i-1][1]-a)<0.01
    if contiguous:
      fc.append(f"[{lab}][s{i}]concat=n=2:v=1:a=0[j{i}]");cum+=d
    else:
      fc.append(f"[{lab}][s{i}]xfade=transition=fade:duration={X}:offset={cum-X:.3f}[j{i}]");cum+=d-X
    lab=f'j{i}'
  out=O+name+'.mp4'
  cmd=['ffmpeg','-v','error','-y','-i',src,'-filter_complex',';'.join(fc),'-map',f'[{lab}]','-an','-c:v','libx264','-preset','slow','-crf','23','-pix_fmt','yuv420p','-movflags','+faststart',out]
  r=subprocess.run(cmd,capture_output=True,text=True)
  if r.returncode: print(name,'ERR',r.stderr[-400:]);continue
  subprocess.run(['ffmpeg','-v','error','-y','-ss',str(pt),'-i',out,'-frames:v','1','-q:v','3',O+'posters/'+name+'.jpg'])
  print(f"{name}: {cum:.1f}s  {os.path.getsize(out)//1024}KB")

order=['data','mapgen','engine1','engine2','engine2b','engine3','engine4','engine5','audio','ui_render','ui_app']
js='\n'.join(open(f'src/{f}.js').read() for f in order)
t=open('template.html').read()
out=t.replace('/*__JS__*/',js)
import os
os.makedirs('dist',exist_ok=True)
open('dist/three-strikes.html','w').write(out)
print(len(out),'bytes')

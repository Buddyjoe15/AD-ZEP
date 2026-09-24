from pathlib import Path
import os
os.chdir(Path(__file__).resolve().parent)
Path('output').mkdir(exist_ok=True)
s=Path('source/GroundFall.Alpha_GF-FND-001/src/Groundfall_Master_v0_7_0.html').read_text()
s=s.replace('GROUNDFALL','EARTH ZERO PROTOCOL').replace('Groundfall v0.7.0 Master ready','Earth Zero Protocol prototype ready').replace('v0.7.0 Master','AD-EZP 0.5').replace('Main Character','Commander Vance').replace('ENEMIES DISABLED','EXPEDITION ACTIVE')
s=s.replace('<title>Groundfall', '<title>Abyssal Dawn: Earth Zero Protocol — Groundfall')
hero_start=s.index('      if(G.Assets.shadow.complete&&G.Assets.shadow.naturalWidth)')
hero_end=s.index('\n    }',hero_start)
s=s[:hero_start]+'      G.UnitVisuals.hero(g,u,z,S.time);'+s[hero_end:]
spider_start=s.index('      // Logistics Drone: compact unmanned utility carrier')
spider_end=s.index('\n    }',spider_start)
s=s[:spider_start]+'      G.UnitVisuals.utility(g,u,z,S.time);'+s[spider_end:]
s=s.replace('<title>Abyssal Dawn: Earth Zero Protocol — Groundfall — AD-EZP 0.5</title>', '<title>Abyssal Dawn: Earth Zero Protocol — First Expedition</title>')
s=s.replace('Logistics Drone','Utility Spider').replace('truck moving to build','Utility Spider moving to build')
s=s.replace('u.x-bw/2,u.y-24,bw,bh','u.x-bw/2,u.y-(u.isHero?70:34),bw,bh').replace('u.x-bw/2+1,u.y-23,','u.x-bw/2+1,u.y-(u.isHero?69:33),')
s=s.replace('S.seed=opts.seed||72491','S.seed=opts.seed??72491')
s=s.replace('</body>','<script>\n'+Path('unit-visuals.js').read_text()+'\n'+Path('extension.js').read_text()+'\n'+Path('debug-menu.js').read_text()+'\n</script>\n</body>')
Path('output/Abyssal_Dawn_Earth_Zero_Protocol_v0_5.html').write_text(s)

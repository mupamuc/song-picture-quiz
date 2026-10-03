"""Package only the public website's runtime files from an exact Git commit."""
import hashlib, json, re, subprocess, sys
from pathlib import Path
APP=Path(__file__).resolve().parents[1]
destination=Path(sys.argv[1]).resolve()
destination.mkdir(parents=True,exist_ok=True)
sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=APP,text=True).strip()
build=json.loads((APP/'build-info.json').read_text('utf-8'))
files={'index.html','styles.css','japanese.css','slideshow.css','favicon.svg','build-info.json','songs.json','slideshow.json','audio/unlock.wav','vendor/THIRD_PARTY.txt',build['app'],build['startup']}
for song in json.loads((APP/'songs.json').read_text('utf-8')):
    files.add(song['image']);files.add(song['audio']['src'])
album=json.loads((APP/'slideshow.json').read_text('utf-8'))
files.update(p['src'] for p in album['photos'])
files.update(t['src'] for t in album['tracks'])
for relative in files:
    assert re.fullmatch(r'[a-zA-Z0-9._/-]+',relative) and '..' not in relative.split('/')
    assert (APP/relative).is_file()
diff=subprocess.check_output(['git','diff','HEAD','--',*sorted(files)],cwd=APP)
assert not diff, 'Commit the published runtime files before packaging'
archive=destination/f'site-{sha}.tar.gz'
subprocess.run(['git','archive','--format=tar.gz',f'--output={archive}',sha,'--',*sorted(files)],cwd=APP,check=True)
manifest={'commit':sha,'files':[{'path':p,'sha256':hashlib.sha256((APP/p).read_bytes()).hexdigest(),'bytes':(APP/p).stat().st_size} for p in sorted(files)],'photos':len(album['photos']),'fullTracks':len(album['tracks']),'archive_sha256':hashlib.sha256(archive.read_bytes()).hexdigest()}
(destination/f'site-{sha}.json').write_text(json.dumps(manifest,indent=2)+'\n','utf-8')
print(json.dumps({'commit':sha,'archive':str(archive),'sha256':manifest['archive_sha256'],'files':len(files),'photos':len(album['photos']),'fullTracks':len(album['tracks']),'bytes':archive.stat().st_size}))

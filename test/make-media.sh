#!/usr/bin/env bash
# Generates the test video used by test/e2e.py: speech (espeak-ng) with silent gaps over an ffmpeg test pattern.
set -e
cd "$(dirname "$0")"; mkdir -p media; cd media
i=0
for t in "Hello friends, welcome to Clip Kit." "This tool removes silence automatically." "Captions are made right inside your browser." "No upload, totally free for every creator."; do
  espeak-ng -s 150 -w s$i.wav "$t"; i=$((i+1))
done
ffmpeg -v error -y -f lavfi -t 1.0 -i anullsrc=r=22050:cl=mono -f lavfi -t 2.5 -i anullsrc=r=22050:cl=mono -i s0.wav -i s1.wav -i s2.wav -i s3.wav -filter_complex "[0][2][1][3][1][4][1][5][0]concat=n=9:v=0:a=1,aresample=44100[a]" -map "[a]" speech.wav
ffmpeg -v error -y -f lavfi -i "testsrc2=s=1280x720:r=30:d=21.5" -i speech.wav -vf "drawbox=x='mod(t*200,1180)':y=560:w=100:h=100:color=0xe3b65a@1:t=fill" -c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p -c:a aac -b:a 128k -shortest -movflags +faststart test-landscape.mp4
echo "ok: test/media/test-landscape.mp4"
# Run: python3 test/e2e.py http://127.0.0.1:4173/ test/out 390 844   (needs: pip install playwright && playwright install chromium)

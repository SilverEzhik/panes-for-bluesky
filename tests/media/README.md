These four short HLS segments and their playlist are locally generated test
patterns with a synthetic tone. No third-party media is included.

Regenerate from the repository root using ffmpeg:

```sh
ffmpeg -f lavfi -i testsrc=size=160x90:rate=15 -f lavfi -i sine=frequency=440:sample_rate=44100 -t 4 -c:v libx264 -pix_fmt yuv420p -profile:v baseline -level 3.0 -g 15 -c:a aac -b:a 32k -f hls -hls_time 1 -hls_playlist_type vod -hls_segment_filename tests/media/segment%02d.ts tests/media/playlist.m3u8
```

The ephemeral HTTP server in `tests/video.spec.ts` serves them only during tests.
They are not included in the production PWA.

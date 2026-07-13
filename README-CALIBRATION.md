# Calibration reference

The file `data/calibration/reference.json` is a JSON array of hand-labeled episode references. Add one object per complete cached episode using this format:

```json
[
  {
    "audioFile": "data/audio-cache/show-id/episode-id.mp3",
    "trueWordCount": 8123,
    "trueFillers": 94,
    "trueLongestRunSec": 38.5
  }
]
```

Set `audioFile` to the exact repo-relative value in `data/episodes.json`. Count words with the pipeline convention: letters, normalized numbers, and contractions each count as one word. Count `um`, `uh`, `like`, `you know`, `sort of`, and `kind of`; each multiword phrase counts once. For `trueLongestRunSec`, measure the longest audible speech span that has no pause of at least 1.0 second. Run `bun run pipeline:calibrate` after `data/stats.json` exists. The report prints signed error, absolute error, percentage error, mean absolute error, bias, and mean absolute percentage error; percentage error excludes zero-valued references.

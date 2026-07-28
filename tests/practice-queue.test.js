const test = require("node:test");
const assert = require("node:assert/strict");

const PracticeQueue = require("../src/domain/practice-queue.js");

const parts = [
  { key: "entrance", label: "Entrance" },
  { key: "psalm", label: "Responsorial Psalm" },
  { key: "communion", label: "Communion Hymn 1" },
  { key: "communion2", label: "Communion Hymn 2" },
  { key: "recessional", label: "Recessional" },
];

test("extracts video IDs from supported YouTube video links", () => {
  const cases = [
    ["https://youtu.be/D6_KModMCtg", "D6_KModMCtg"],
    ["https://www.youtube.com/watch?v=D6_KModMCtg&feature=share", "D6_KModMCtg"],
    ["https://music.youtube.com/watch?v=D6_KModMCtg", "D6_KModMCtg"],
    ["https://youtube.com/embed/D6_KModMCtg", "D6_KModMCtg"],
    ["https://youtube.com/shorts/D6_KModMCtg", "D6_KModMCtg"],
    ["https://youtube.com/live/D6_KModMCtg", "D6_KModMCtg"],
  ];

  cases.forEach(([url, expected]) => {
    assert.equal(PracticeQueue.youtubeVideoId(url), expected);
  });
});

test("rejects non-video, malformed, insecure, and non-YouTube links", () => {
  [
    "",
    "not a URL",
    "http://youtu.be/D6_KModMCtg",
    "https://youtube.com.example.org/watch?v=D6_KModMCtg",
    "https://youtube.com/results?search_query=hymn",
    "https://youtube.com/watch?v=too-short",
    "https://youtu.be/D6_KModMCtg/extra",
  ].forEach(url => assert.equal(PracticeQueue.youtubeVideoId(url), ""));
});

test("builds a queue in Mass order and reports unavailable assigned songs", () => {
  const result = PracticeQueue.build({
    parts,
    songs: {
      recessional: {
        title: "Closing",
        youtubeUrl: "https://youtu.be/CCCCCCCCCCC",
      },
      entrance: {
        title: "Opening",
        youtubeUrl: "https://youtube.com/watch?v=AAAAAAAAAAA",
      },
      psalm: {
        title: "Psalm",
        youtubeUrl: "https://example.org/not-youtube",
      },
      communion: {
        title: "Communion",
        youtubeUrl: "",
      },
      communion2: {
        title: "Opening again",
        youtubeUrl: "https://youtube.com/watch?v=AAAAAAAAAAA",
      },
    },
  });

  assert.equal(result.assignedCount, 5);
  assert.equal(result.playableCount, 3);
  assert.equal(result.missingCount, 2);
  assert.deepEqual(
    result.items.map(item => [item.part, item.label, item.title, item.videoId]),
    [
      ["entrance", "Entrance", "Opening", "AAAAAAAAAAA"],
      ["communion2", "Communion Hymn 2", "Opening again", "AAAAAAAAAAA"],
      ["recessional", "Recessional", "Closing", "CCCCCCCCCCC"],
    ],
  );
});

test("creates an API-enabled privacy-enhanced URL for the selected starting item", () => {
  const items = [
    { videoId: "AAAAAAAAAAA" },
    { videoId: "BBBBBBBBBBB" },
    { videoId: "CCCCCCCCCCC" },
  ];

  assert.equal(
    PracticeQueue.embedUrl(items, 0, { origin: "https://mass.example" }),
    "https://www.youtube-nocookie.com/embed/AAAAAAAAAAA"
      + "?autoplay=1&playsinline=1&rel=0&enablejsapi=1&origin=https%3A%2F%2Fmass.example",
  );
  assert.equal(
    PracticeQueue.embedUrl(items, 1),
    "https://www.youtube-nocookie.com/embed/BBBBBBBBBBB"
      + "?autoplay=1&playsinline=1&rel=0&enablejsapi=1",
  );
  assert.equal(
    PracticeQueue.embedUrl(items, 2),
    "https://www.youtube-nocookie.com/embed/CCCCCCCCCCC"
      + "?autoplay=1&playsinline=1&rel=0&enablejsapi=1",
  );
  assert.equal(PracticeQueue.embedUrl([], 0), "");
});

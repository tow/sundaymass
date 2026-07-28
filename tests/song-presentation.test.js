const test = require("node:test");
const assert = require("node:assert/strict");

const presentation = require("../src/domain/song-presentation.js");

const completeSong = {
  song: "Table of Plenty",
  authors: "Dan Schutte",
  copyrightYear: "1975, 2016",
  copyrightOwner: "OCP",
  source: "Breaking Bread",
};

test("YouTube video links and IDs normalize to canonical watch URLs", () => {
  assert.equal(
    presentation.safeYoutubeUrl("https://www.youtube.com/watch?v=D6_KModMCtg"),
    "https://www.youtube.com/watch?v=D6_KModMCtg",
  );
  assert.equal(
    presentation.safeYoutubeUrl("https://music.youtube.com/watch?v=D6_KModMCtg"),
    "https://www.youtube.com/watch?v=D6_KModMCtg",
  );
  assert.equal(
    presentation.safeYoutubeUrl("https://youtu.be/D6_KModMCtg?si=tracking"),
    "https://www.youtube.com/watch?v=D6_KModMCtg",
  );
  assert.equal(presentation.safeYoutubeUrl("D6_KModMCtg"), "https://www.youtube.com/watch?v=D6_KModMCtg");
  assert.equal(presentation.youtubeVideoId("https://youtube.com/shorts/D6_KModMCtg"), "D6_KModMCtg");

  [
    "",
    "not a URL",
    "http://youtube.com/watch?v=D6_KModMCtg",
    "https://youtube.com.example.org/watch?v=D6_KModMCtg",
    "https://example.org/watch?v=D6_KModMCtg",
    "https://youtube.com/results?search_query=hymn",
  ].forEach(value => assert.equal(presentation.safeYoutubeUrl(value), ""));
});

test("copyright completeness requires prompted fields but not source", () => {
  assert.equal(presentation.copyrightComplete({}), true);
  assert.equal(presentation.copyrightComplete({ title: "A song" }), false);
  assert.equal(
    presentation.copyrightComplete({
      title: "A song",
      authors: "An author",
      copyrightOwner: "A publisher",
      copyrightYear: "2026",
      source: "",
    }),
    true,
  );
  assert.equal(
    presentation.copyrightComplete({
      title: "Traditional",
      authors: "Traditional",
      copyrightOwner: "Traditional — public domain",
      copyrightYear: "",
    }),
    true,
  );
});

test("attribution variants preserve the existing page presentations", () => {
  assert.equal(
    presentation.copyrightLine(completeSong),
    "© 1975, 2016 OCP",
  );
  assert.equal(
    presentation.publicPlanAttribution(completeSong),
    "Authors: Dan Schutte · © 1975, 2016 OCP · Source: Breaking Bread",
  );
  assert.equal(
    presentation.editorPlanAttribution(completeSong),
    "Dan Schutte · © 1975, 2016 OCP · Breaking Bread",
  );
  assert.deepEqual(
    presentation.repertoireDetails(completeSong),
    ["Dan Schutte", "© 1975, 2016 OCP", "Source: Breaking Bread"],
  );
});

test("the on-screen Mass plan shows only the unlabelled author", () => {
  assert.equal(presentation.planAuthor(completeSong), "Dan Schutte");
  assert.equal(presentation.planAuthor({ authors: "" }), "");
});

test("public-domain attribution omits the copyright mark", () => {
  const traditional = {
    title: "Traditional hymn",
    authors: "Traditional",
    copyrightYear: "",
    copyrightOwner: "Public domain",
    source: "",
  };

  assert.equal(presentation.copyrightLine(traditional), "Public domain");
  assert.equal(
    presentation.publicPlanAttribution(traditional),
    "Authors: Traditional · Public domain",
  );
});

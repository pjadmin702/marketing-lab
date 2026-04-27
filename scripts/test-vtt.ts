import { parseVtt } from "../src/lib/transcribe";

const sample = `WEBVTT
Kind: captions
Language: en

00:00:00.000 --> 00:00:02.500
Hello world this is a test

00:00:02.500 --> 00:00:05.000
<c.colorE5E5E5>This is</c> the second line

00:00:05.000 --> 00:00:07.000
This is the second line

00:00:07.000 --> 00:00:09.000
- Different speaker now
`;

const segs = parseVtt(sample);

let pass = 0;
let fail = 0;
function expect(cond: boolean, label: string) {
  if (cond) { console.log(`  ok  ${label}`); pass++; }
  else      { console.log(`  FAIL ${label}`); fail++; }
}

expect(segs.length === 3,                                              "deduped adjacent identical lines into 3 segments");
expect(segs[0].start === 0 && segs[0].end === 2.5,                     "first segment timing");
expect(segs[0].text === "Hello world this is a test",                  "first segment text");
expect(segs[1].text === "This is the second line",                     "stripped <c> tags");
expect(segs[1].start === 2.5 && segs[1].end === 7,                     "merged duplicate line spans 2.5 -> 7s");
expect(segs[2].text === "Different speaker now",                       "stripped leading dash speaker label");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

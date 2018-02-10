import { checkTemplate } from "./";

interface Test {
  description: string;
  fn: () => Promise<any>;
}

const testsToRun: Test[] = [];
let testsFailedCount = 0;
let totalTestsRun = 0;
let totalTestTime = 0;

test("Single element working", async () => {
  await checkTemplate(
    "test/elms/foo-elm.html",
    "test/elms/foo-elm.js",
    "foo.foo_elm",
    [
      {
        path: "custom-externs.js",
        src: "/** @externs */ var page; var Gerrit;"
      }
    ]
  );
});

(async () => {
  await Promise.all(testsToRun.map(t => testRun(t)));
  if (testsFailedCount > 0) {
    console.error(
      `${testsFailedCount} tests failed in ${totalTestTime / 1000} seconds`
    );
    process.exit(1);
  } else {
    console.error(
      `${totalTestsRun} tests completed in ${totalTestTime / 1000} seconds`
    );
  }
})();

async function test(description: Test["description"], fn: Test["fn"]) {
  testsToRun.push({ description, fn });
}

async function testRun({
  description,
  fn
}: {
  description: Test["description"];
  fn: Test["fn"];
}) {
  totalTestsRun++;
  const startTime = Date.now();
  try {
    process.stdout.write(`Test: ${description}\n`);
    await fn();
    process.stdout.write(
      `- Test: ${description} - Took ${(Date.now() - startTime) /
        1000} seconds\n`
    );
  } catch (e) {
    console.error(`- Test ${description} failed ${e}`);
    testsFailedCount++;
  }
  totalTestTime += Date.now() - startTime;
}

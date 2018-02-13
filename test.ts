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
  await checkTemplate([
    {
      htmlSrcPath: "test/elms/foo-elm.html",
      jsSrcPath: "test/elms/foo-elm.js",
      jsModule: "foo.foo_elm"
    }
  ]);
});

test("Multiple element working", async () => {
  await checkTemplate(
    [
      {
        htmlSrcPath: "test/elms/foo-elm.html",
        jsSrcPath: "test/elms/foo-elm.js",
        jsModule: "foo.foo_elm"
      },
      {
        htmlSrcPath: "test/elms/zap-elm.html",
        jsSrcPath: "test/elms/zap-elm.js",
        jsModule: "foo.zap_elm"
      }
    ],
    [
      {
        path: "custom-externs.js",
        src: `
      /** @externs */
      var /** @type {string} */ glob;
    `
      }
    ]
  );
});

(async () => {
  for (const testCase of testsToRun) {
    await testRun(testCase);
  }

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
      `- Complete : ${description} - Took ${(Date.now() - startTime) /
        1000} seconds\n`
    );
  } catch (e) {
    console.error(`- Error ${description} failed ${e}`);
    testsFailedCount++;
  }
  totalTestTime += Date.now() - startTime;
}

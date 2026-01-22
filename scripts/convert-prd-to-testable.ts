#!/usr/bin/env bun
/**
 * Convert a PRD with string acceptance criteria to testable format
 * Usage: bun run scripts/convert-prd-to-testable.ts <input.json> <output.json> <projectPath>
 */

import * as fs from 'fs';

interface SimpleAC {
  text: string;
}

interface TestableAC {
  id: string;
  text: string;
  testCommand: string;
  passes: boolean;
  lastRun: string | null;
}

interface UserStory {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string[] | TestableAC[];
  passes: boolean;
  [key: string]: unknown;
}

interface PRD {
  userStories: UserStory[];
  [key: string]: unknown;
}

function generateTestCommand(storyId: string, acText: string, projectPath: string): string {
  const text = acText.toLowerCase();

  // Common patterns and their test commands
  const patterns: [RegExp, string][] = [
    // File/directory existence
    [
      /next\.js.*initialized|app router/i,
      `test -d ${projectPath}/app || test -d ${projectPath}/src/app`,
    ],
    [/typescript.*strict/i, `grep -q '"strict": true' ${projectPath}/tsconfig.json`],
    [
      /eslint.*configured/i,
      `test -f ${projectPath}/eslint.config.js || test -f ${projectPath}/.eslintrc.js || test -f ${projectPath}/.eslintrc.json`,
    ],
    [
      /prettier.*configured/i,
      `test -f ${projectPath}/.prettierrc || test -f ${projectPath}/prettier.config.js`,
    ],
    [
      /tailwind.*configured/i,
      `test -f ${projectPath}/tailwind.config.ts || test -f ${projectPath}/tailwind.config.js`,
    ],
    [
      /docker-compose/i,
      `test -f ${projectPath}/docker-compose.yml || test -f ${projectPath}/infrastructure/postgres/docker-compose.yml`,
    ],
    [/drizzle.*configured/i, `test -f ${projectPath}/drizzle.config.ts`],
    [/environment variables/i, `test -f ${projectPath}/.env.local || test -f ${projectPath}/.env`],

    // Build/run commands
    [
      /npm run dev.*without errors/i,
      `cd ${projectPath} && timeout 10 npm run dev 2>&1 | head -20 | grep -qv 'error'`,
    ],
    [/npm run build succeeds/i, `cd ${projectPath} && npm run build`],
    [/npm run db:push/i, `cd ${projectPath} && npm run db:push`],
    [
      /bun run dev/i,
      `cd ${projectPath} && timeout 10 bun run dev 2>&1 | head -20 | grep -qv 'error'`,
    ],
    [/bun run build/i, `cd ${projectPath} && bun run build`],

    // tRPC
    [
      /trpc.*configured|trpc server/i,
      `test -f ${projectPath}/src/server/trpc.ts || test -f ${projectPath}/src/trpc/server.ts`,
    ],
    [
      /base routers/i,
      `ls ${projectPath}/src/server/routers/*.ts 2>/dev/null | wc -l | grep -q '[1-9]'`,
    ],
    [/tanstack query/i, `grep -rq '@tanstack/react-query' ${projectPath}/package.json`],

    // shadcn/ui
    [/shadcn.*configured|shadcn.*cli/i, `test -f ${projectPath}/components.json`],
    [
      /core components installed/i,
      `test -d ${projectPath}/src/components/ui || test -d ${projectPath}/components/ui`,
    ],
    [/dark mode/i, `grep -rq 'dark:' ${projectPath}/src || grep -rq 'dark:' ${projectPath}/app`],

    // Database tables
    [/(\w+) table/i, `grep -rqi '$1' ${projectPath}/src/db/schema`],
    [
      /tenants table/i,
      `grep -qi 'tenants' ${projectPath}/src/db/schema.ts || grep -qi 'tenants' ${projectPath}/src/db/schema/index.ts`,
    ],
    [
      /users table/i,
      `grep -qi 'users' ${projectPath}/src/db/schema.ts || grep -qi 'users' ${projectPath}/src/db/schema/index.ts`,
    ],

    // Auth/Keycloak
    [
      /keycloak.*realm/i,
      `curl -s http://localhost:8180/realms/rdy/.well-known/openid-configuration | grep -q 'issuer'`,
    ],
    [/keycloak.*client/i, `grep -q 'rdy-app' ${projectPath}/.env.local`],
    [
      /login.*logout.*working/i,
      `curl -s http://localhost:3001/api/auth/providers | grep -q 'keycloak'`,
    ],
    [
      /role.*middleware/i,
      `test -f ${projectPath}/src/middleware.ts || test -f ${projectPath}/middleware.ts`,
    ],
    [/protected routes/i, `grep -rq 'getServerSession\\|useSession\\|auth()' ${projectPath}/src`],

    // Pages/Routes
    [
      /page at (\/\S+)/i,
      `test -f ${projectPath}/src/app$1/page.tsx || test -f ${projectPath}/app$1/page.tsx`,
    ],
    [
      /dashboard at/i,
      `test -f ${projectPath}/src/app/dashboard/page.tsx || test -f ${projectPath}/app/dashboard/page.tsx`,
    ],

    // Generic patterns
    [
      /api endpoint/i,
      `ls ${projectPath}/src/app/api/**/*.ts 2>/dev/null | wc -l | grep -q '[1-9]'`,
    ],
    [/pagination/i, `grep -rqi 'pagination\\|page.*limit\\|offset' ${projectPath}/src`],
    [/search.*filter/i, `grep -rqi 'search\\|filter' ${projectPath}/src`],
  ];

  for (const [pattern, command] of patterns) {
    if (pattern.test(text)) {
      return command;
    }
  }

  // Default: create a manual check placeholder
  return `echo "MANUAL CHECK: ${acText.replace(/"/g, '\\"').substring(0, 50)}..." && exit 1`;
}

function convertPRD(inputPath: string, outputPath: string, projectPath: string): void {
  const content = fs.readFileSync(inputPath, 'utf-8');
  const prd: PRD = JSON.parse(content);

  let convertedCount = 0;
  let manualCount = 0;

  for (const story of prd.userStories) {
    if (!Array.isArray(story.acceptanceCriteria)) continue;

    const newCriteria: TestableAC[] = [];

    for (let i = 0; i < story.acceptanceCriteria.length; i++) {
      const ac = story.acceptanceCriteria[i];
      const text = typeof ac === 'string' ? ac : (ac as TestableAC).text;

      // Skip if already in testable format
      if (typeof ac === 'object' && 'testCommand' in ac) {
        newCriteria.push(ac as TestableAC);
        continue;
      }

      const testCommand = generateTestCommand(story.id, text, projectPath);
      const isManual = testCommand.startsWith('echo "MANUAL CHECK');

      if (isManual) manualCount++;
      else convertedCount++;

      newCriteria.push({
        id: `AC-${story.id}-${i + 1}`,
        text,
        testCommand,
        passes: false,
        lastRun: null,
      });
    }

    story.acceptanceCriteria = newCriteria;
    story.passes = false; // Reset all passes
  }

  fs.writeFileSync(outputPath, JSON.stringify(prd, null, 2));

  console.log(`Converted PRD saved to: ${outputPath}`);
  console.log(`  - Auto-generated test commands: ${convertedCount}`);
  console.log(`  - Manual check placeholders: ${manualCount}`);
  console.log(`\nReview the output and replace MANUAL CHECK placeholders with real test commands.`);
}

// Main
const args = process.argv.slice(2);
if (args.length < 3) {
  console.log(
    'Usage: bun run scripts/convert-prd-to-testable.ts <input.json> <output.json> <projectPath>',
  );
  console.log(
    'Example: bun run scripts/convert-prd-to-testable.ts prd.json prd-testable.json /home/stefan/projects/rdy',
  );
  process.exit(1);
}

const [inputPath, outputPath, projectPath] = args;
convertPRD(inputPath, outputPath, projectPath);
